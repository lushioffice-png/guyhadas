// GuyHadas Visibility OS - generic external-API governor (Universal
// External API Cost-Control Rule - see the permanent rule doc in the
// project docs: claude/visibility-os-api-cost-control-rule.md). Every
// paid/quota-limited external provider call is meant to go through
// runGoverned() below, so "we have an API key configured" never silently
// means "the system is free to call that API whenever it wants."
//
// Deliberately the smallest version of this that actually enforces the
// rule - a single function, not a generic AI/provider framework:
//
//   hash input -> reuse cache if valid -> check circuit breaker ->
//   check budget/quota -> execute -> record usage -> update circuit
//   breaker
//
// `apiUsage` docs are the ledger AND the cache in one collection, not two -
// a prior successful call for the same provider/operation/businessId/
// inputHash combination IS the cached result, with its own `result`
// payload stored right on that usage record. See firestore.rules:
// admin-read-only, written only via the Admin SDK here, same posture as
// `integrations`/`trafficSnapshots`.
//
// Known, documented scaling caveat: budget/quota checks sum matching
// apiUsage docs for the relevant time window in JS, rather than
// maintaining a running counter document. That's correct and simple at
// this system's current scale (a handful of real businesses); if usage
// volume ever grows enough for this query to get slow or expensive,
// switch to incrementing counter docs instead - don't do that
// prematurely (spec: "do not over-engineer this yet").

const admin = require("firebase-admin");
const crypto = require("crypto");
const LIMITS = require("./apiLimits");

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, k) => {
        acc[k] = sortKeysDeep(value[k]);
        return acc;
      }, {});
  }
  return value;
}

// Deterministic regardless of key order, so the same logical input always
// hashes the same way - the whole cache depends on this.
function hashInput(value) {
  const json = JSON.stringify(sortKeysDeep(value));
  return crypto.createHash("sha256").update(json).digest("hex");
}

function getLimits(provider, operation) {
  const limits = LIMITS[provider] && LIMITS[provider][operation];
  if (!limits) {
    throw new Error(`No apiLimits configured for ${provider}.${operation} - add an entry to functions/apiLimits.js before calling runGoverned for it`);
  }
  return limits;
}

async function findCachedUsage({ provider, operation, businessId, inputHash, cacheTtlMs }) {
  const db = admin.firestore();
  const snap = await db
    .collection("apiUsage")
    .where("provider", "==", provider)
    .where("operation", "==", operation)
    .where("businessId", "==", businessId)
    .where("status", "==", "success")
    .where("inputHash", "==", inputHash)
    .orderBy("retrievedAtMs", "desc")
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0].data();
  if (cacheTtlMs != null && Date.now() - doc.retrievedAtMs > cacheTtlMs) return null;
  return doc;
}

// Only calls that actually reached (or attempted) the provider count
// against a budget/quota - a cache hit cost nothing, and counting it would
// defeat the whole point of caching.
async function sumUsage({ provider, operation, businessId, sinceMs }) {
  const db = admin.firestore();
  let query = db
    .collection("apiUsage")
    .where("provider", "==", provider)
    .where("operation", "==", operation)
    .where("retrievedAtMs", ">=", sinceMs);
  if (businessId) query = query.where("businessId", "==", businessId);
  const snap = await query.get();
  const real = snap.docs.map((d) => d.data()).filter((d) => !d.cacheHit);
  return {
    count: real.length,
    costUsd: real.reduce((sum, d) => sum + (d.actualCostUsd != null ? d.actualCostUsd : d.estimatedCostUsd || 0), 0)
  };
}

async function checkBudget({ provider, operation, businessId, estimatedCostUsd }) {
  const limits = getLimits(provider, operation);
  const now = Date.now();
  const dayStart = now - 24 * 60 * 60 * 1000;
  const monthStart = now - 30 * 24 * 60 * 60 * 1000;

  if (limits.maxEstimatedCostPerCallUsd != null && estimatedCostUsd != null && estimatedCostUsd > limits.maxEstimatedCostPerCallUsd) {
    return {
      allowed: false,
      reason: "blocked_by_budget",
      message: `Estimated cost $${estimatedCostUsd.toFixed(4)} exceeds the $${limits.maxEstimatedCostPerCallUsd} per-call limit for ${provider}.${operation}`
    };
  }

  const checks = [
    ["maxRequestsPerBusinessPerDay", businessId ? sumUsage({ provider, operation, businessId, sinceMs: dayStart }) : null, "today"],
    ["maxRequestsPerBusinessPerMonth", businessId ? sumUsage({ provider, operation, businessId, sinceMs: monthStart }) : null, "this month"],
    ["maxRequestsGlobalPerDay", sumUsage({ provider, operation, sinceMs: dayStart }), "today (all businesses)"],
    ["maxRequestsGlobalPerMonth", sumUsage({ provider, operation, sinceMs: monthStart }), "this month (all businesses)"]
  ].filter(([key]) => limits[key] != null);

  const resolved = await Promise.all(checks.map(([, promise]) => promise));

  for (let i = 0; i < checks.length; i++) {
    const [key, , windowLabel] = checks[i];
    const usage = resolved[i];
    if (usage.count >= limits[key]) {
      return {
        allowed: false,
        reason: "blocked_by_quota",
        message: `${provider}.${operation} already made ${usage.count} calls ${windowLabel} (limit ${limits[key]})`
      };
    }
  }

  return { allowed: true };
}

async function getCircuitBreakerDoc(provider, operation) {
  const db = admin.firestore();
  const ref = db.collection("apiCircuitBreakers").doc(`${provider}_${operation}`);
  const snap = await ref.get();
  return { ref, data: snap.exists ? snap.data() : { consecutiveFailures: 0, openUntilMs: 0 } };
}

async function checkCircuitBreaker(provider, operation) {
  const { data } = await getCircuitBreakerDoc(provider, operation);
  if (data.openUntilMs && Date.now() < data.openUntilMs) {
    return {
      allowed: false,
      reason: "blocked_by_safety_limit",
      message: `${provider}.${operation} circuit breaker is open (${data.consecutiveFailures} consecutive failures) until ${new Date(data.openUntilMs).toISOString()}`
    };
  }
  return { allowed: true };
}

async function recordCircuitResult(provider, operation, success) {
  const limits = getLimits(provider, operation);
  const { ref, data } = await getCircuitBreakerDoc(provider, operation);
  if (success) {
    await ref.set({ consecutiveFailures: 0, openUntilMs: 0, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return;
  }
  const consecutiveFailures = (data.consecutiveFailures || 0) + 1;
  const openUntilMs = consecutiveFailures >= limits.circuitBreakerThreshold ? Date.now() + limits.circuitBreakerCooldownMs : 0;
  await ref.set(
    { consecutiveFailures, openUntilMs, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
}

async function recordUsage(record) {
  const db = admin.firestore();
  await db.collection("apiUsage").add({
    jobId: null,
    requestId: null,
    result: null,
    recordsRequested: null,
    recordsReturned: null,
    inputTokens: null,
    outputTokens: null,
    cachedTokens: null,
    estimatedCostUsd: null,
    actualCostUsd: null,
    currency: "USD",
    retryCount: 0,
    errorMessage: null,
    ...record,
    retrievedAt: admin.firestore.FieldValue.serverTimestamp(),
    retrievedAtMs: Date.now()
  });
}

// The one entry point every governed provider call goes through.
//
//   provider, operation: keys into functions/apiLimits.js
//   businessId: which business this call is for (required - every
//     provider call in this app is business-scoped; account-level
//     operations would need their own businessId: null convention if one
//     is ever added, matching `integrations`)
//   input: anything JSON-serializable that fully determines the result -
//     hashed to decide whether a previous result can be reused
//   forceRefresh: ignore a valid cache. Never bypasses the circuit
//     breaker or budget/quota checks below it - per the cost-control
//     rule, "force refresh means ignore a valid cache, not ignore safety
//     controls."
//   estimateCost: optional (input) => number|null, a pre-call USD
//     estimate checked against maxEstimatedCostPerCallUsd. Omit for a
//     provider with no predictable $ pricing (e.g. Semrush) - the
//     request-count limits below still apply regardless.
//   execute: async (input) => ({ result, usage }) - the actual provider
//     call. `usage` is free-form (tokens/records/units/actualCostUsd...)
//     and stored on the ledger row alongside `result`.
//
// Returns one of:
//   { ok: true,  cacheHit: true,  result, usage, blocked: null }
//   { ok: true,  cacheHit: false, result, usage, blocked: null }
//   { ok: false, cacheHit: false, result: null, usage: null,
//     blocked: { reason: "blocked_by_budget"|"blocked_by_quota"|
//                "blocked_by_safety_limit", message } }
// A genuine execution error (bad key, network failure, parse failure)
// is recorded on the ledger and then rethrown - callers handle it the
// same way they handled an unguarded call before, they just also get a
// usage record of the failure.
async function runGoverned({ provider, operation, businessId, input, forceRefresh, estimateCost, execute }) {
  if (!businessId) throw new Error("runGoverned requires a businessId - every provider call in this app is business-scoped");
  const limits = getLimits(provider, operation);
  const inputHash = hashInput(input);

  if (!forceRefresh) {
    const cached = await findCachedUsage({ provider, operation, businessId, inputHash, cacheTtlMs: limits.cacheTtlMs });
    if (cached) {
      return { ok: true, cacheHit: true, result: cached.result, usage: null, blocked: null };
    }
  }

  const circuit = await checkCircuitBreaker(provider, operation);
  if (!circuit.allowed) {
    await recordUsage({ provider, operation, businessId, inputHash, status: circuit.reason, errorMessage: circuit.message, cacheHit: false });
    return { ok: false, cacheHit: false, result: null, usage: null, blocked: { reason: circuit.reason, message: circuit.message } };
  }

  const estimatedCostUsd = estimateCost ? estimateCost(input) : null;
  const budget = await checkBudget({ provider, operation, businessId, estimatedCostUsd });
  if (!budget.allowed) {
    await recordUsage({
      provider, operation, businessId, inputHash,
      status: budget.reason,
      errorMessage: budget.message,
      estimatedCostUsd,
      cacheHit: false
    });
    return { ok: false, cacheHit: false, result: null, usage: null, blocked: { reason: budget.reason, message: budget.message } };
  }

  try {
    const { result, usage } = await execute(input);
    await recordUsage({
      provider, operation, businessId, inputHash,
      status: "success",
      result: result != null ? result : null,
      requestId: (usage && usage.requestId) || null,
      recordsRequested: (usage && usage.recordsRequested) != null ? usage.recordsRequested : null,
      recordsReturned: (usage && usage.recordsReturned) != null ? usage.recordsReturned : null,
      inputTokens: (usage && usage.inputTokens) != null ? usage.inputTokens : null,
      outputTokens: (usage && usage.outputTokens) != null ? usage.outputTokens : null,
      cachedTokens: (usage && usage.cachedTokens) != null ? usage.cachedTokens : null,
      estimatedCostUsd,
      actualCostUsd: (usage && usage.actualCostUsd) != null ? usage.actualCostUsd : null,
      providerUnitsUsed: (usage && usage.providerUnitsUsed) != null ? usage.providerUnitsUsed : null,
      cacheHit: false
    });
    await recordCircuitResult(provider, operation, true);
    return { ok: true, cacheHit: false, result, usage: usage || null, blocked: null };
  } catch (err) {
    await recordUsage({ provider, operation, businessId, inputHash, status: "error", errorMessage: err.message, estimatedCostUsd, cacheHit: false });
    await recordCircuitResult(provider, operation, false);
    throw err;
  }
}

module.exports = { hashInput, runGoverned };
