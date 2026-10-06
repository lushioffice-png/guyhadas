// GuyHadas Visibility OS - Search Universe & Qualification (roadmap
// Milestone 3). Implements the first half of the roadmap's core loop:
//
//   Discovery → Filtering → Normalization → Owner Validation → Approved
//   Search Universe
//
// Owner validation (approve/reject/prioritize/brand-strategic/unsure) and
// manual topic addition are plain Firestore writes from the client -
// `searchTopics`/`keywords`/`competitors`/`businessKnowledge` are
// admin-read/write in firestore.rules, same posture as `businesses`/
// `tasks`/`opportunities`. What has to live here (server-side, ID-token
// checked, same as functions/visibility.js) is anything that needs a
// credential: pulling candidates from Google Search Console or Semrush, or
// fetching the business's own public website. Both the discovery sources
// (GSC/website/Semrush) and the filtering+normalization that runs on their
// output share one pipeline - storeDiscoveredCandidates() below - so there
// is exactly one place a discovered topic gets created or merged.

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { google } = require("googleapis");
const cheerio = require("cheerio");
const { setCors, requireAdmin, getVisibilityAuth } = require("./visibility");
const semrush = require("./semrush");

const JACCARD_MERGE_THRESHOLD = 0.5;
const MIN_QUERY_LENGTH = 2;

function tokenize(text) {
  return new Set(
    text
      .toLowerCase()
      .replace(/[.,!?"'()[\]{}:;]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 0)
  );
}

function jaccard(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

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

function extractDomain(websiteUrl) {
  if (!websiteUrl) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(websiteUrl) ? websiteUrl : `https://${websiteUrl}`;
    return new URL(withProtocol).hostname.replace(/^www\./, "");
  } catch (err) {
    return null;
  }
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

// --- Discovery source 2: lightweight website scan (no external dependency) ---
const MAX_PAGES = 12;
const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "GuyHadasVisibilityOS/1.0 (+https://guyhadas.xyz)" }
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function discoverSitePages(origin) {
  const sitemapXml = await fetchWithTimeout(`${origin}/sitemap.xml`);
  if (sitemapXml) {
    const $ = cheerio.load(sitemapXml, { xmlMode: true });
    const locs = $("loc")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter((u) => u.startsWith(origin));
    if (locs.length > 0) return locs.slice(0, MAX_PAGES);
  }
  return [origin]; // fallback: homepage only
}

function extractPhrasesFromHtml(html) {
  const $ = cheerio.load(html);
  const phrases = new Set();
  const title = $("title").first().text().trim();
  if (title) phrases.add(title);
  const metaDesc = $('meta[name="description"]').attr("content");
  if (metaDesc) phrases.add(metaDesc.trim());
  $("h1, h2").each((_, el) => {
    const text = $(el).text().trim().replace(/\s+/g, " ");
    if (text.length >= MIN_QUERY_LENGTH && text.length <= 120) phrases.add(text);
  });
  return Array.from(phrases);
}

exports.visibilityDiscoverFromWebsite = functions.https.onRequest(async (req, res) => {
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
    const bizDoc = await db.collection("businesses").doc(businessId).get();
    if (!bizDoc.exists || !bizDoc.data().website) {
      res.status(400).json({ success: false, error: "This business has no website set in its profile" });
      return;
    }
    const domain = extractDomain(bizDoc.data().website);
    const origin = `https://${domain}`;

    const pages = await discoverSitePages(origin);
    const allPhrases = new Set();
    for (const pageUrl of pages) {
      const html = await fetchWithTimeout(pageUrl);
      if (!html) continue;
      for (const phrase of extractPhrasesFromHtml(html)) allPhrases.add(phrase);
    }

    if (allPhrases.size === 0) {
      res.status(502).json({ success: false, error: `Could not read any pages from ${origin}` });
      return;
    }

    const candidates = Array.from(allPhrases).map((query) => ({ query }));
    const result = await storeDiscoveredCandidates(businessId, candidates, "website", origin);
    res.status(200).json({ success: true, pagesScanned: pages.length, ...result });
  } catch (err) {
    console.error("visibilityDiscoverFromWebsite error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Discovery source 3: Semrush ---
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

    const { businessId, seedPhrase, database } = req.body || {};
    if (!businessId || !seedPhrase) {
      res.status(400).json({ success: false, error: "businessId and seedPhrase are required" });
      return;
    }
    const db_ = database || "il";

    try {
      const db = admin.firestore();
      const bizDoc = await db.collection("businesses").doc(businessId).get();
      if (!bizDoc.exists || !bizDoc.data().website) {
        res.status(400).json({ success: false, error: "This business has no website set in its profile" });
        return;
      }
      const domain = extractDomain(bizDoc.data().website);

      const [related, ownKeywords, competitors] = await Promise.all([
        semrush.fetchRelatedKeywords(seedPhrase, db_, 30),
        semrush.fetchDomainOrganicKeywords(domain, db_, 50),
        semrush.fetchOrganicCompetitors(domain, db_, 10)
      ]);

      const candidates = [...related, ...ownKeywords].map((r) => ({
        query: r.query,
        volume: r.volume ?? null,
        difficulty: r.difficulty ?? null
      }));

      const result = await storeDiscoveredCandidates(businessId, candidates, "semrush", db_);
      const competitorsStored = await upsertCompetitors(businessId, competitors);

      res.status(200).json({ success: true, ...result, competitorsFound: competitorsStored });
    } catch (err) {
      console.error("visibilityDiscoverFromSemrush error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });
