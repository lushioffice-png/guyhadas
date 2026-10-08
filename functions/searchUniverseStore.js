// GuyHadas Visibility OS - M3.2 Search Universe pipeline core
// (docs/MASTER.md §9, §16; docs/M3.2_IMPLEMENTATION_BRIEF.md §3–9).
//
//   seed (seedBuilder.js) -> governed discovery (Semrush) / GSC
//     -> RAW QUERIES (keywords, per-source evidence, seed lineage)
//     -> FILTERING (owner exclusion rules only, stored with the rule)
//     -> NORMALIZATION (exact first, then title-anchored token overlap
//        with a place-name guard)
//     -> SEARCH TOPICS (above the raw queries) + lightweight qualification
//     -> owner review (client writes, unchanged)
//
// Kept free of firebase-functions / googleapis so it runs under the
// index-enforcing in-memory Firestore in functions/test. The HTTP endpoints
// live in searchUniverse.js and only parse requests + call into here.
//
// Invariants:
//   - a raw query is ONE keyword row per business; re-discovery refreshes
//     its evidence, never duplicates it and never overwrites another
//     source's evidence or a known metric with null;
//   - a re-discovered query stays in the topic it already belongs to, so an
//     owner-excluded topic keeps its queries (rejection is durable);
//   - discovery never changes a topic's owner status, never deletes, and
//     never creates pages/tasks/opportunities;
//   - every paid provider call goes through runGoverned (apiUsage.js).

const admin = require("firebase-admin");
const { tokenize, jaccard } = require("./textSimilarity");
const { buildSeeds, seedRef: toSeedRef, normalizePhrase } = require("./seedBuilder");
const { qualifyTopic, buildQualificationContext } = require("./topicQualification");
const { runGoverned } = require("./apiUsage");
const apiLimits = require("./apiLimits");
const semrush = require("./semrush");
const { extractDomain } = require("./webUtils");

const JACCARD_MERGE_THRESHOLD = 0.5;
const MIN_QUERY_LENGTH = 2;
const MAX_SEED_REFS = 25;
const SEMRUSH_RELATED_LIMIT = 30;
const SEMRUSH_DOMAIN_LIMIT = 50;
const SEMRUSH_COMPETITOR_LIMIT = 10;

// --- context ---------------------------------------------------------------

async function loadDiscoveryContext(businessId) {
  const db = admin.firestore();
  const [bizDoc, servicesSnap, knowledgeSnap] = await Promise.all([
    db.collection("businesses").doc(businessId).get(),
    db.collection("businessServices").where("businessId", "==", businessId).get(),
    db.collection("businessKnowledge").where("businessId", "==", businessId).get()
  ]);
  const business = bizDoc.exists ? { id: businessId, ...bizDoc.data() } : { id: businessId };
  const services = servicesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const knowledge = knowledgeSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const exclusionRules = knowledge
    .filter((k) => k.type === "exclusion_rule" && (k.content || "").trim())
    .map((k) => ({ id: k.id, content: k.content.trim() }));
  return { business, services, knowledge, exclusionRules };
}

function buildSeedsForContext(ctx, config) {
  return buildSeeds({
    business: ctx.business,
    services: ctx.services,
    exclusionRules: ctx.exclusionRules.map((r) => r.content),
    config
  });
}

// Place tokens: every geography the business knows about (owner markets and
// all facet geographies, whatever their provenance). Two queries that name
// different places are never grouped into one topic.
function placeTokens(ctx) {
  const out = new Set();
  const add = (v) => tokenize(v).forEach((t) => out.add(t));
  (ctx.business.geographicMarkets || []).forEach(add);
  for (const s of ctx.services) for (const fv of (s.facets && s.facets.geographies) || []) add(fv.value);
  return out;
}

function placesIn(tokens, places) {
  return [...tokens].filter((t) => places.has(t)).sort().join("|");
}

// --- filtering ---------------------------------------------------------------

function matchExclusionRule(query, rules) {
  const lower = query.toLowerCase();
  return rules.find((r) => lower.includes(r.content.toLowerCase())) || null;
}

// --- normalization -----------------------------------------------------------

// Exact (normalized) match against a topic's title or any of its raw
// queries first; otherwise the best token overlap against the topic TITLE
// only (not its accumulated queries - that made matching drift as topics
// grew), with the place guard. Deterministic: highest score, then the
// earliest topic.
function findTopicFor(query, topics, places) {
  const norm = normalizePhrase(query);
  const exact = topics.find((t) => normalizePhrase(t.title) === norm || t.queries.some((q) => normalizePhrase(q) === norm));
  if (exact) return { topic: exact, rule: "exact", score: 1 };
  const qTokens = tokenize(query);
  const qPlaces = placesIn(qTokens, places);
  let best = null;
  for (const t of topics) {
    const tTokens = tokenize(t.title);
    if (placesIn(tTokens, places) !== qPlaces) continue;
    const score = jaccard(qTokens, tTokens);
    if (score >= JACCARD_MERGE_THRESHOLD && (!best || score > best.score)) best = { topic: t, rule: "title_token_overlap", score };
  }
  return best;
}

// --- evidence ----------------------------------------------------------------

function nonNull(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) if (v !== null && v !== undefined) out[k] = v;
  return out;
}

function evidenceFor(candidate, opts) {
  return nonNull({
    sourceProperty: opts.sourceProperty || null,
    report: opts.report || null,
    volume: candidate.volume,
    difficulty: candidate.difficulty,
    competition: candidate.competition,
    position: candidate.position,
    url: candidate.url,
    metrics: candidate.metrics
  });
}

function mergeSeedRefs(existing, ref) {
  const list = Array.isArray(existing) ? existing.slice() : [];
  if (ref && !list.some((r) => r.seedKey === ref.seedKey) && list.length < MAX_SEED_REFS) list.push(ref);
  return list;
}

function keywordSources(kw) {
  if (kw.sources && typeof kw.sources === "object") return { ...kw.sources };
  // rows written before per-source evidence existed: lift the legacy fields
  if (!kw.source) return {};
  return {
    [kw.source]: nonNull({
      sourceProperty: kw.sourceProperty,
      volume: kw.volume,
      difficulty: kw.difficulty,
      metrics: kw.metrics,
      legacy: true
    })
  };
}

// --- the pipeline ------------------------------------------------------------

// candidates: [{ query, volume?, difficulty?, competition?, position?, url?, metrics? }]
// opts: { source: "gsc" | "semrush", sourceProperty, report, seed (full seed object) }
async function storeDiscoveredCandidates(businessId, candidates, opts, ctxIn) {
  const db = admin.firestore();
  const ctx = ctxIn || (await loadDiscoveryContext(businessId));
  const places = placeTokens(ctx);
  const qualCtx = buildQualificationContext(ctx);
  const ref = opts.seed ? toSeedRef(opts.seed) : null;
  const now = admin.firestore.FieldValue.serverTimestamp();

  const topicsSnap = await db.collection("searchTopics").where("businessId", "==", businessId).get();
  const topics = topicsSnap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      title: data.title,
      queries: data.queries || [],
      sources: Array.isArray(data.sources) ? data.sources.slice() : data.source ? [data.source] : [],
      seedRefs: data.seedRefs || [],
      dirty: false
    };
  });
  const topicById = new Map(topics.map((t) => [t.id, t]));

  const counts = { discovered: candidates.length, topicsCreated: 0, topicsMerged: 0, refreshed: 0, excluded: 0, ignored: 0 };
  const seenThisRun = new Set();

  for (const candidate of candidates) {
    const query = String(candidate.query || "").replace(/\s+/g, " ").trim();
    if (query.length < MIN_QUERY_LENGTH || seenThisRun.has(query)) {
      counts.ignored++;
      continue;
    }
    seenThisRun.add(query);

    const existingSnap = await db.collection("keywords").where("businessId", "==", businessId).where("query", "==", query).limit(1).get();
    const existing = existingSnap.empty ? null : { id: existingSnap.docs[0].id, ...existingSnap.docs[0].data() };
    const evidence = evidenceFor(candidate, opts);
    const rule = matchExclusionRule(query, ctx.exclusionRules);

    // Auditable exclusion: the raw query is kept, with the owner rule that
    // excluded it, and is not attached to any reviewable topic.
    if (rule && !existing) {
      await db.collection("keywords").add({
        businessId,
        topicId: null,
        query,
        source: opts.source,
        sourceProperty: opts.sourceProperty || null,
        volume: candidate.volume ?? null,
        difficulty: candidate.difficulty ?? null,
        metrics: candidate.metrics ?? null,
        sources: { [opts.source]: { ...evidence, firstSeenAt: now, lastSeenAt: now, timesSeen: 1 } },
        sourceList: [opts.source],
        seedRefs: ref ? [ref] : [],
        grouping: null,
        excludedByRule: { ruleId: rule.id, rule: rule.content, reason: "owner_exclusion_rule" },
        discoveredAt: now,
        firstDiscoveredAt: now,
        lastDiscoveredAt: now
      });
      counts.excluded++;
      continue;
    }

    let topic = null;
    let grouping = null;
    if (existing && existing.topicId && topicById.has(existing.topicId)) {
      topic = topicById.get(existing.topicId);
      grouping = existing.grouping || { rule: "existing_keyword", score: null, topicTitle: topic.title };
    } else if (!rule) {
      const match = findTopicFor(query, topics, places);
      if (match) {
        topic = match.topic;
        grouping = { rule: match.rule, score: Math.round(match.score * 100) / 100, topicTitle: topic.title };
        if (!topic.queries.includes(query)) {
          topic.queries.push(query);
          topic.dirty = true;
          counts.topicsMerged++;
        }
      } else {
        const qual = qualifyTopic({ title: query, queries: [query] }, qualCtx);
        const topicRef = await db.collection("searchTopics").add({
          businessId,
          title: query,
          queries: [query],
          status: "new",
          source: opts.source,
          sources: [opts.source],
          sourceCount: 1,
          seedRefs: ref ? [ref] : [],
          addedBy: "system",
          notes: "",
          ...qual,
          createdAt: now,
          updatedAt: now,
          lastDiscoveredAt: now
        });
        topic = { id: topicRef.id, title: query, queries: [query], sources: [opts.source], seedRefs: ref ? [ref] : [], dirty: false, created: true };
        topics.push(topic);
        topicById.set(topic.id, topic);
        grouping = { rule: "new_topic", score: null, topicTitle: query };
        counts.topicsCreated++;
      }
    }

    if (topic && !topic.created) {
      if (!topic.sources.includes(opts.source)) {
        topic.sources.push(opts.source);
        topic.dirty = true;
      }
      const refs = mergeSeedRefs(topic.seedRefs, ref);
      if (refs.length !== topic.seedRefs.length) {
        topic.seedRefs = refs;
        topic.dirty = true;
      }
      topic.touched = true;
    }

    if (existing) {
      const sources = keywordSources(existing);
      const prev = sources[opts.source] || {};
      const seenBefore = prev.timesSeen || (Object.keys(prev).length > 0 ? 1 : 0);
      sources[opts.source] = { ...prev, ...evidence, firstSeenAt: prev.firstSeenAt || now, lastSeenAt: now, timesSeen: seenBefore + 1 };
      delete sources[opts.source].legacy;
      const update = {
        sources,
        sourceList: Object.keys(sources).sort(),
        seedRefs: mergeSeedRefs(existing.seedRefs, ref),
        lastDiscoveredAt: now,
        discoveredAt: now
      };
      // legacy top-level fields: refreshed only with real values, never nulled
      if (candidate.volume != null) update.volume = candidate.volume;
      if (candidate.difficulty != null) update.difficulty = candidate.difficulty;
      if (candidate.metrics != null) update.metrics = candidate.metrics;
      if (rule && !existing.excludedByRule) update.excludedByRule = { ruleId: rule.id, rule: rule.content, reason: "owner_exclusion_rule" };
      if (!existing.grouping && grouping) update.grouping = grouping;
      await db.collection("keywords").doc(existing.id).update(update);
      if (rule) counts.excluded++;
      else counts.refreshed++;
    } else {
      await db.collection("keywords").add({
        businessId,
        topicId: topic ? topic.id : null,
        query,
        source: opts.source,
        sourceProperty: opts.sourceProperty || null,
        volume: candidate.volume ?? null,
        difficulty: candidate.difficulty ?? null,
        metrics: candidate.metrics ?? null,
        sources: { [opts.source]: { ...evidence, firstSeenAt: now, lastSeenAt: now, timesSeen: 1 } },
        sourceList: [opts.source],
        seedRefs: ref ? [ref] : [],
        grouping,
        excludedByRule: null,
        discoveredAt: now,
        firstDiscoveredAt: now,
        lastDiscoveredAt: now
      });
    }
  }

  // One write per touched topic: provenance + refreshed qualification.
  // Owner status is never part of this write.
  for (const t of topics) {
    if (t.created ? !t.dirty : !(t.dirty || t.touched)) continue;
    const qual = qualifyTopic({ title: t.title, queries: t.queries }, qualCtx);
    await db.collection("searchTopics").doc(t.id).update({
      queries: t.queries,
      sources: t.sources,
      sourceCount: t.sources.length,
      seedRefs: t.seedRefs,
      ...qual,
      lastDiscoveredAt: now,
      updatedAt: now
    });
  }

  return counts;
}

async function upsertCompetitors(businessId, competitors) {
  const db = admin.firestore();
  let count = 0;
  for (const c of competitors) {
    if (!c.domain) continue;
    const existing = await db.collection("competitors").where("businessId", "==", businessId).where("domain", "==", c.domain).limit(1).get();
    if (!existing.empty) {
      await db.collection("competitors").doc(existing.docs[0].id).update({
        relevanceScore: c.relevance ?? null,
        sharedKeywordCount: c.commonKeywords ?? null
      });
    } else {
      await db.collection("competitors").add({
        businessId,
        domain: c.domain,
        discoveredVia: "semrush",
        relevanceScore: c.relevance ?? null,
        sharedKeywordCount: c.commonKeywords ?? null,
        addedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    count++;
  }
  return count;
}

// --- governed Semrush discovery --------------------------------------------

function blockedResult(governed) {
  return {
    ok: false,
    status: /_unavailable$/.test(governed.blocked.reason) ? 503 : 429,
    error: governed.blocked.message,
    blockedReason: governed.blocked.reason,
    cacheDecision: governed.decision,
    providerCalled: false
  };
}

// Market discovery for ONE seed from the CURRENT confirmed Service Map. The
// client sends only the seedKey; the phrase is rebuilt here, so discovery
// can never be driven by an arbitrary typed phrase.
async function discoverSemrushForSeed({ businessId, seedKey, database = "il", forceRefresh = false }) {
  const ctx = await loadDiscoveryContext(businessId);
  const seed = buildSeedsForContext(ctx).seeds.find((s) => s.seedKey === seedKey);
  if (!seed) {
    return { ok: false, status: 400, error: "This seed is not in the current confirmed Service Map (rebuild the seed list).", providerCalled: false };
  }
  const limits = apiLimits.semrush.discoverRelatedForSeed;
  const governed = await runGoverned({
    provider: "semrush",
    operation: "discoverRelatedForSeed",
    businessId,
    // Identity = what determines Semrush's answer: the phrase + database.
    // Lineage (service/facets) is stored on the results, not hashed, so the
    // same phrase reached from two services reuses one paid result.
    input: { seed: normalizePhrase(seed.phrase), database },
    model: null,
    forceRefresh: forceRefresh === true,
    reason: forceRefresh === true ? "owner_confirmed_new_paid_semrush_seed_discovery" : "owner_requested_semrush_seed_discovery",
    execute: async () => {
      const related = await semrush.fetchRelatedKeywords(seed.phrase, database, SEMRUSH_RELATED_LIMIT);
      return {
        result: { related },
        usage: { recordsRequested: SEMRUSH_RELATED_LIMIT, recordsReturned: related.length, providerUnitsUsed: related.length * limits.unitsPerLine }
      };
    }
  });
  if (!governed.ok) return blockedResult(governed);

  const candidates = (governed.result.related || []).map((r) => ({ query: r.query, volume: r.volume ?? null, difficulty: r.difficulty ?? null, competition: r.competition ?? null }));
  const stored = await storeDiscoveredCandidates(businessId, candidates, { source: "semrush", sourceProperty: database, report: "phrase_related", seed }, ctx);
  return {
    ok: true,
    seed: toSeedRef(seed),
    ...stored,
    cacheHit: governed.cacheHit,
    cacheDecision: governed.decision,
    providerCalled: governed.providerCalled,
    providerUnitsUsed: governed.providerCalled && governed.usage ? governed.usage.providerUnitsUsed : 0
  };
}

// Domain-level discovery (what the site already ranks for + competitors).
// Separate governed operation so seeds don't re-buy domain data.
async function discoverSemrushForDomain({ businessId, database = "il", forceRefresh = false }) {
  const ctx = await loadDiscoveryContext(businessId);
  if (!ctx.business.website) return { ok: false, status: 400, error: "This business has no website set in its profile", providerCalled: false };
  const domain = extractDomain(ctx.business.website);
  const limits = apiLimits.semrush.discoverDomainOrganic;
  const governed = await runGoverned({
    provider: "semrush",
    operation: "discoverDomainOrganic",
    businessId,
    input: { domain, database },
    model: null,
    forceRefresh: forceRefresh === true,
    reason: forceRefresh === true ? "owner_confirmed_new_paid_semrush_domain_discovery" : "owner_requested_semrush_domain_discovery",
    execute: async () => {
      const [ownKeywords, competitors] = await Promise.all([
        semrush.fetchDomainOrganicKeywords(domain, database, SEMRUSH_DOMAIN_LIMIT),
        semrush.fetchOrganicCompetitors(domain, database, SEMRUSH_COMPETITOR_LIMIT)
      ]);
      return {
        result: { ownKeywords, competitors },
        usage: {
          recordsRequested: SEMRUSH_DOMAIN_LIMIT + SEMRUSH_COMPETITOR_LIMIT,
          recordsReturned: ownKeywords.length + competitors.length,
          providerUnitsUsed: ownKeywords.length * limits.unitsPerKeywordLine + competitors.length * limits.unitsPerCompetitorLine
        }
      };
    }
  });
  if (!governed.ok) return blockedResult(governed);

  const candidates = (governed.result.ownKeywords || []).map((r) => ({ query: r.query, volume: r.volume ?? null, difficulty: r.difficulty ?? null, position: r.position ?? null, url: r.url ?? null }));
  const stored = await storeDiscoveredCandidates(businessId, candidates, { source: "semrush", sourceProperty: database, report: "domain_organic" }, ctx);
  const competitorsFound = await upsertCompetitors(businessId, governed.result.competitors || []);
  return {
    ok: true,
    ...stored,
    competitorsFound,
    cacheHit: governed.cacheHit,
    cacheDecision: governed.decision,
    providerCalled: governed.providerCalled,
    providerUnitsUsed: governed.providerCalled && governed.usage ? governed.usage.providerUnitsUsed : 0
  };
}

module.exports = {
  loadDiscoveryContext,
  buildSeedsForContext,
  storeDiscoveredCandidates,
  upsertCompetitors,
  discoverSemrushForSeed,
  discoverSemrushForDomain,
  findTopicFor
};
