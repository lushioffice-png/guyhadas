// GuyHadas Visibility OS - M5 Opportunity Engine - HTTP endpoint.
// Auth + parsing only; logic in opportunityEngineStore.js / opportunityRules.js.
// Explicit owner action only (button), never on render. Reads Firestore
// only: no provider is called, nothing can be spent.

const functions = require("firebase-functions");
const { setCors, requireAdmin } = require("./visibility");
const store = require("./opportunityEngineStore");

exports.visibilityRunOpportunityEngine = functions.runWith({ timeoutSeconds: 120, memory: "512MB" }).https.onRequest(async (req, res) => {
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
    const r = await store.runOpportunityEngine({ businessId });
    res.status(200).json({ success: true, ...r });
  } catch (err) {
    console.error("visibilityRunOpportunityEngine error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});
