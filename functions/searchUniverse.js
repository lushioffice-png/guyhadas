// GuyHadas Visibility OS - Search Universe & Qualification (roadmap
// Milestone 3.2, docs/MASTER.md §9) - HTTP endpoints.
//
//   CONFIRMED SERVICE MAP -> SEEDS -> MARKET DISCOVERY / GSC -> RAW QUERIES
//   -> FILTERING -> NORMALIZATION -> SEARCH TOPICS -> QUALIFICATION
//   -> OWNER REVIEW -> APPROVED SEARCH UNIVERSE (-> M4)
//
// This file only authenticates, parses requests and calls into
// searchUniverseStore.js (the pipeline core, which is what the tests
// exercise). Owner validation (topic status, manual topics, exclusion
// rules) stays a plain client write - see firestore.rules.
//
// The website is never a source of Search Topics (the retired
// visibilityDiscoverFromWebsite must not return): it is evidence for the
// Service Map only (businessUnderstanding.js). Discovery never creates
// pages, tasks or opportunities.
//
// Provider discipline: Semrush only through runGoverned (cache first, fail
// closed, quotas, ledger). Search Console discovery is a Google quota call
// that is not yet governed - the documented PRODUCTION-READINESS GAP —
// UNIVERSAL GOOGLE API GOVERNANCE (docs/MASTER.md); M3.2 adds no new
// ungoverned call. Nothing here runs on page load: every endpoint is a
// button press.

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { google } = require("googleapis");
const { setCors, requireAdmin, getVisibilityAuth } = require("./visibility");
const semrush = require("./semrush");
const store = require("./searchUniverseStore");

function preflight(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return false;
  }
  return true;
}

// --- Seeds: built from the confirmed Service Map (Firestore reads only, no
// provider call, no cost). ---
exports.visibilityBuildSearchSeeds = functions.https.onRequest(async (req, res) => {
  if (!preflight(req, res)) return;
  const user = await requireAdmin(req, res);
  if (!user) return;
  const { businessId } = req.body || {};
  if (!businessId) {
    res.status(400).json({ success: false, error: "businessId is required" });
    return;
  }
  try {
    const ctx = await store.loadDiscoveryContext(businessId);
    const built = store.buildSeedsForContext(ctx);
    res.status(200).json({ success: true, ...built });
  } catch (err) {
    console.error("visibilityBuildSearchSeeds error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

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

      const result = await store.storeDiscoveredCandidates(businessId, candidates, { source: "gsc", sourceProperty: propertyId, report: "searchanalytics_query_90d" });
      res.status(200).json({ success: true, ...result });
    } catch (err) {
      console.error("visibilityDiscoverFromSearchConsole error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

// --- Discovery source 2: Semrush (market demand), governed ---
function semrushNotConfigured(res) {
  res.status(400).json({
    success: false,
    error: "Semrush is not configured yet (SEMRUSH_API_KEY is missing or a placeholder) - no request was made.",
    providerCalled: false
  });
}

function sendGoverned(res, result) {
  if (!result.ok) {
    res.status(result.status || 500).json({ success: false, ...result });
    return;
  }
  res.status(200).json({ success: true, ...result });
}

// One confirmed-Service-Map seed -> phrase_related. The client sends the
// seedKey only; the phrase is rebuilt server-side from confirmed services.
exports.visibilityDiscoverFromSemrush = functions
  .runWith({ secrets: ["SEMRUSH_API_KEY"] })
  .https.onRequest(async (req, res) => {
    if (!preflight(req, res)) return;
    const user = await requireAdmin(req, res);
    if (!user) return;
    if (!semrush.isSemrushConfigured()) return semrushNotConfigured(res);
    const { businessId, seedKey, database, forceRefresh } = req.body || {};
    if (!businessId || !seedKey) {
      res.status(400).json({ success: false, error: "businessId and seedKey are required (seeds come from the confirmed Service Map)" });
      return;
    }
    try {
      const result = await store.discoverSemrushForSeed({ businessId, seedKey, database: database || "il", forceRefresh: forceRefresh === true });
      sendGoverned(res, result);
    } catch (err) {
      console.error("visibilityDiscoverFromSemrush error:", err.message);
      res.status(502).json({ success: false, error: err.message, providerCalled: err.providerCalled === true, cacheDecision: err.decision || null });
    }
  });

// What the business's own domain already ranks for + organic competitors.
exports.visibilityDiscoverDomainFromSemrush = functions
  .runWith({ secrets: ["SEMRUSH_API_KEY"] })
  .https.onRequest(async (req, res) => {
    if (!preflight(req, res)) return;
    const user = await requireAdmin(req, res);
    if (!user) return;
    if (!semrush.isSemrushConfigured()) return semrushNotConfigured(res);
    const { businessId, database, forceRefresh } = req.body || {};
    if (!businessId) {
      res.status(400).json({ success: false, error: "businessId is required" });
      return;
    }
    try {
      const result = await store.discoverSemrushForDomain({ businessId, database: database || "il", forceRefresh: forceRefresh === true });
      sendGoverned(res, result);
    } catch (err) {
      console.error("visibilityDiscoverDomainFromSemrush error:", err.message);
      res.status(502).json({ success: false, error: err.message, providerCalled: err.providerCalled === true, cacheDecision: err.decision || null });
    }
  });
