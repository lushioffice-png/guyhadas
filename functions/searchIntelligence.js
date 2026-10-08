// GuyHadas Visibility OS - M4 Search Intelligence & Baseline (docs/MASTER.md
// §41 M4) - HTTP endpoints. Auth + request parsing only; the logic lives in
// searchIntelligenceStore.js (tested).
//
// Both endpoints run only on an explicit button press - nothing on page
// load. The one provider call (GSC query x page) goes through runGoverned:
// cache first, quota, fail closed, ledger. No Semrush, no GA4, no LLM call.

const functions = require("firebase-functions");
const cheerio = require("cheerio");
const { setCors, requireAdmin } = require("./visibility");
const store = require("./searchIntelligenceStore");
const gscAdapter = require("./googleSearchConsole");

function preflight(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return false;
  }
  return true;
}

exports.visibilityRunSearchIntelligence = functions
  .runWith({ secrets: ["VISIBILITY_GOOGLE_SA_KEY"], timeoutSeconds: 300, memory: "1GB" })
  .https.onRequest(async (req, res) => {
    if (!preflight(req, res)) return;
    const user = await requireAdmin(req, res);
    if (!user) return;
    const { businessId, forceRefresh } = req.body || {};
    if (!businessId) {
      res.status(400).json({ success: false, error: "businessId is required" });
      return;
    }
    try {
      const run = await store.runSearchIntelligence({ businessId, forceRefresh: forceRefresh === true, deps: { cheerio, gscAdapter } });
      res.status(200).json({ success: true, runId: run.runId, summary: run.summary, gsc: run.gsc, crawl: { status: run.crawl.status, reason: run.crawl.reason } });
    } catch (err) {
      console.error("visibilityRunSearchIntelligence error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

exports.visibilityCaptureBaseline = functions.https.onRequest(async (req, res) => {
  if (!preflight(req, res)) return;
  const user = await requireAdmin(req, res);
  if (!user) return;
  const { businessId, note } = req.body || {};
  if (!businessId) {
    res.status(400).json({ success: false, error: "businessId is required" });
    return;
  }
  try {
    const b = await store.captureBaseline({ businessId, capturedBy: user.email, note: typeof note === "string" ? note.slice(0, 500) : null });
    res.status(200).json({ success: true, baselineId: b.baselineId, version: b.version, identicalToPrevious: b.identicalToPrevious, availability: b.availability });
  } catch (err) {
    console.error("visibilityCaptureBaseline error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});
