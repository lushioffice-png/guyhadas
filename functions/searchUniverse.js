// GuyHadas Visibility OS - Search Universe & Qualification (roadmap
// Milestone 3.2). Implements the second half of the corrected core loop:
//
//   Business Understanding -> Service Map -> Search Discovery ->
//   Filtering -> Normalization -> Owner Validation -> Approved Search
//   Universe
//
// Business Understanding and the Service Map (Milestone 3.1) live in
// functions/businessUnderstanding.js. What's here is everything after
// that: pulling search-demand candidates from Google Search Console or
// Semrush (seeded by a confirmed service, chosen in the UI - see
// BusinessTopics.tsx), then automatic filtering + Jaccard normalization +
// owner validation. A direct website-scrape discovery source used to live
// here too (visibilityDiscoverFromWebsite); it's been retired - scraping a
// marketing/design website's own words and treating them as search demand
// produced noise, not real demand. The website is now evidence for
// *business* understanding only (functions/businessUnderstanding.js), never
// a direct source of Search Topics.
//
// Owner validation (approve/reject/prioritize/brand-strategic/unsure) and
// manual topic addition are plain Firestore writes from the client -
// `searchTopics`/`keywords`/`competitors`/`businessKnowledge` are
// admin-read/write in firestore.rules, same posture as `businesses`/
// `tasks`/`opportunities`. What has to live here (server-side, ID-token
// checked, same as functions/visibility.js) is anything that needs a
// credential: pulling candidates from Google Search Console or Semrush.
// Both discovery sources (GSC/Semrush) and the filtering+normalization that
// runs on their output share one pipeline - storeDiscoveredCandidates()
// below - so there is exactly one place a discovered topic gets created or
// merged.

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { google } = require("googleapis");
const { setCors, requireAdmin, getVisibilityAuth } = require("./visibility");
const { tokenize, jaccard } = require("./textSimilarity");
const { extractDomain } = require("./webUtils");
const semrush = require("./semrush");
const { runGoverned } = require("./apiUsage");
const apiLimits = require("./apiLimits");

const JACCARD_MERGE_THRESHOLD = 0.5;
const MIN_QUERY_LENGTH = 2;

// --- Automatic Filtering (3.3) ---
// Deterministic, conservative on purpose: only drops a candidate when it
// matches an explicit owner-authored exclusion rule. Everything else
// (including ambiguous candidates) proceeds to normalization and lands in
// front of the owner as "new" - per spec: "do not automatically remove
// ambiguous topics."
async function loadExclusionRules(businessId) {
  const snap = await admin
    .firestore()
    .collection("businessKnowledge")
    .where("businessId", "==", businessId)
    .where("type", "==", "exclusion_rule")
    .get();
  return snap.docs.map((d) => (d.data().content || "").toLowerCase()).filter((s) => s.length > 0);
}

function matchesExclusionRule(query, exclusionRules) {
  const lower = query.toLowerCase();
  return exclusionRules.some((rule) => lower.includes(rule));
}

// --- Discovery + Filtering + Normalization pipeline ---
// candidates: [{ query, volume?, difficulty?, metrics?: {impressions?, clicks?, position?} }]
async function storeDiscoveredCandidates(businessId, candidates, source, sourceProperty) {
  const db = admin.firestore();
  const exclusionRules = await loadExclusionRules(businessId);

  const topicsSnap = await db.collection("searchTopics").where("businessId", "==", businessId).get();
  // Working in-memory copy so topics created earlier in this same batch can
  // also be matched against, not just topics that existed before this run.
  const topics = topicsSnap.docs.map((d) => ({
    id: d.id,
    title: d.data().title,
    queries: d.data().queries || [],
    tokens: tokenize([d.data().title, ...(d.data().queries || [])].join(" "))
  }));

  let created = 0;
  let merged = 0;
  let excluded = 0;
  let skippedDuplicate = 0;
  const now = admin.firestore.FieldValue.serverTimestamp();

  for (const candidate of candidates) {
    const query = (candidate.query || "").trim();
    if (query.length < MIN_QUERY_LENGTH) continue;

    if (matchesExclusionRule(query, exclusionRules)) {
      excluded++;
      continue;
    }

    // Dedupe against any existing keyword for this business, regardless of
    // which source discovered it - two sources finding the same phrase is
    // signal, not noise, but shouldn't create two keyword rows for it.
    const existingKeywordSnap = await db
      .collection("keywords")
      .where("businessId", "==", businessId)
      .where("query", "==", query)
      .limit(1)
      .get();

    let topicId;
    const candidateTokens = tokenize(query);
    const match = topics.find((t) => jaccard(candidateTokens, t.tokens) >= JACCARD_MERGE_THRESHOLD);

    if (match) {
      topicId = match.id;
      if (!match.queries.includes(query)) {
        await db.collection("searchTopics").doc(match.id).update({
          queries: admin.firestore.FieldValue.arrayUnion(query),
          updatedAt: now
        });
        match.queries.push(query);
        match.tokens = tokenize([match.title, ...match.queries].join(" "));
        merged++;
      }
    } else {
      const topicRef = await db.collection("searchTopics").add({
        businessId,
        title: query,
        queries: [query],
        status: "new",
        source,
        addedBy: "system",
        notes: "",
        createdAt: now,
        updatedAt: now
      });
      topicId = topicRef.id;
      topics.push({ id: topicId, title: query, queries: [query], tokens: candidateTokens });
      created++;
    }

    if (!existingKeywordSnap.empty) {
      await existingKeywordSnap.docs[0].ref.update({
        volume: candidate.volume ?? null,
        difficulty: candidate.difficulty ?? null,
        metrics: candidate.metrics ?? null,
        discoveredAt: now
      });
      skippedDuplicate++;
    } else {
      await db.collection("keywords").add({
        businessId,
        topicId,
        query,
        source,
        sourceProperty: sourceProperty || null,
        volume: candidate.volume ?? null,
        difficulty: candidate.difficulty ?? null,
        metrics: candidate.metrics ?? null,
        discoveredAt: now
      });
    }
  }

  return { discovered: candidates.length, topicsCreated: created, topicsMerged: merged, excluded, refreshed: skippedDuplicate };
}

async function upsertCompetitors(businessId, competitors) {
  const db = admin.firestore();
  let count = 0;
  for (const c of competitors) {
    if (!c.domain) continue;
    const existing = await db
      .collection("competitors")
      .where("businessId", "==", businessId)
      .where("domain", "==", c.domain)
      .limit(1)
      .get();
    if (!existing.empty) {
      await existing.docs[0].ref.update({
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

// --- Discovery source 1: Google Search Console (already connected, no new setup) ---
exports.visibilityDiscoverFromSearchConsole = functions
  .runWith({ secrets: ["VISIBILITY_GOOGLE_SA_KEY"] })
  .https.onRequest(async (req, res) => {
    setCors(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    const user = await requireAdmin(req, res);
    if (!user) return;

    const { businessId } = req.body || {};
    if (!businessId) {
      res.status(400).json({ success: false, error: "businessId is required" });
      return;
    }

    try {
      const db = admin.firestore();
      const integDoc = await db.collection("integrations").doc(`${businessId}_search_console`).get();
      if (!integDoc.exists || integDoc.data().status === "not_connected") {
        res.status(400).json({ success: false, error: "Search Console is not connected for this business" });
        return;
      }
      const { propertyId } = integDoc.data();

      const auth = getVisibilityAuth(["https://www.googleapis.com/auth/webmasters.readonly"]);
      const searchconsole = google.searchconsole({ version: "v1", auth });

      // A wider net than the 28-day performance snapshot (visibilitySyncSearchConsole)
      // - this is discovery, not a trend metric, so it wants as much real
      // query history as Search Console will give back in one call.
      const end = new Date();
      const start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
      const { data } = await searchconsole.searchanalytics.query({
        siteUrl: propertyId,
        requestBody: {
          startDate: start.toISOString().slice(0, 10),
          endDate: end.toISOString().slice(0, 10),
          dimensions: ["query"],
          rowLimit: 250
        }
      });

      const candidates = (data.rows || [])
        .filter((r) => (r.impressions || 0) > 0)
        .map((r) => ({
          query: r.keys?.[0] || "",
          metrics: { impressions: r.impressions || 0, clicks: r.clicks || 0, position: r.position || 0 }
        }));

      const result = await storeDiscoveredCandidates(businessId, candidates, "gsc", propertyId);
      res.status(200).json({ success: true, ...result });
    } catch (err) {
      console.error("visibilityDiscoverFromSearchConsole error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

// --- Discovery source 2: Semrush ---
// Safely gated behind SEMRUSH_API_KEY (see functions/semrush.js). Until a
// real key with API units is stored in that secret, this returns a clean
// "not configured" error - no architectural change needed once it is.
exports.visibilityDiscoverFromSemrush = functions
  .runWith({ secrets: ["SEMRUSH_API_KEY"] })
  .https.onRequest(async (req, res) => {
    setCors(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    const user = await requireAdmin(req, res);
    if (!user) return;

    if (!semrush.isSemrushConfigured()) {
      res.status(400).json({
        success: false,
        error: "Semrush is not configured yet (no SEMRUSH_API_KEY secret) - see the Search Universe deliverable doc."
      });
      return;
    }

    const { businessId, seedPhrase, database, forceRefresh } = req.body || {};
    if (!businessId || !seedPhrase) {
      res.status(400).json({ success: false, error: "businessId and seedPhrase are required" });
      return;
    }
    const db_ = database || "il";
    const normalizedSeed = seedPhrase.trim().toLowerCase();

    try {
      const db = admin.firestore();
      const bizDoc = await db.collection("businesses").doc(businessId).get();
      if (!bizDoc.exists || !bizDoc.data().website) {
        res.status(400).json({ success: false, error: "This business has no website set in its profile" });
        return;
      }
      const domain = extractDomain(bizDoc.data().website);

      // Semrush costs real API units per call (see functions/apiLimits.js)
      // - gated through the same Universal External API Cost-Control Rule
      // governor as the Anthropic call in businessUnderstanding.js. Unlike
      // that one, this cache has a TTL (search demand drifts day to day
      // even for an unchanged seed/domain) rather than being valid forever
      // - see functions/apiLimits.js's comment on why. The expensive part
      // is the Semrush call itself; storeDiscoveredCandidates/
      // upsertCompetitors below still run on a cache hit since they're free
      // local Firestore writes and already idempotent (dedupe by existing
      // keyword/domain), so a repeated identical request still reflects
      // current normalization/exclusion rules without spending another
      // Semrush call to get there.
      const governed = await runGoverned({
        provider: "semrush",
        operation: "discoverFromSemrush",
        businessId,
        input: { seed: normalizedSeed, database: db_, domain },
        model: null, // Semrush has no model; reports are fixed (see functions/semrush.js)
        forceRefresh: forceRefresh === true,
        execute: async () => {
          const [related, ownKeywords, competitors] = await Promise.all([
            semrush.fetchRelatedKeywords(seedPhrase, db_, 30),
            semrush.fetchDomainOrganicKeywords(domain, db_, 50),
            semrush.fetchOrganicCompetitors(domain, db_, 10)
          ]);
          return {
            result: { related, ownKeywords, competitors },
            usage: {
              recordsReturned: related.length + ownKeywords.length + competitors.length,
              providerUnitsUsed: apiLimits.semrush.discoverFromSemrush.unitsPerCall
            }
          };
        }
      });

      if (!governed.ok) {
        // 503 when a safety check couldn't run (fail closed - infrastructure),
        // 429 when a budget/quota/circuit limit said no.
        const infra = /_unavailable$/.test(governed.blocked.reason);
        res.status(infra ? 503 : 429).json({
          success: false,
          error: governed.blocked.message,
          blockedReason: governed.blocked.reason,
          cacheDecision: governed.decision,
          providerCalled: false
        });
        return;
      }

      const { related, ownKeywords, competitors } = governed.result;
      const candidates = [...related, ...ownKeywords].map((r) => ({
        query: r.query,
        volume: r.volume ?? null,
        difficulty: r.difficulty ?? null
      }));

      const result = await storeDiscoveredCandidates(businessId, candidates, "semrush", db_);
      const competitorsStored = await upsertCompetitors(businessId, competitors);

      res.status(200).json({ success: true, ...result, competitorsFound: competitorsStored, cacheHit: governed.cacheHit, cacheDecision: governed.decision, providerCalled: governed.providerCalled });
    } catch (err) {
      console.error("visibilityDiscoverFromSemrush error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });
