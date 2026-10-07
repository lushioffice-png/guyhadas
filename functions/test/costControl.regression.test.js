// Regression tests for the Universal External API Cost-Control Rule
// (functions/apiUsage.js runGoverned), against an in-memory Firestore that
// ENFORCES the real firestore.indexes.json (see helpers/fakeFirestore.js).
// Run with: node functions/test/costControl.regression.test.js
//
// Scenario letters follow the M3.1 acceptance requirements (2026-10-07):
//   A first run -> miss, provider called once
//   B identical second run -> hit, provider NOT called, $0 ledger row
//   C explicit force refresh -> provider called
//   (D is a UI property - see app/test/analysisFlow.test.ts)
//   E failed / impossible cache lookup -> provider NOT called (fail closed)
//   F changed input -> miss, provider called
//   G same input, different prompt version -> miss
//   H same input, different model -> miss
//   I return to a previous input state -> earlier result reused
// plus: an existing pre-fix ledger row (no `model` field) is reused, a
// failed budget check fails closed, and blocked/hit rows don't consume quota.

const assert = require("assert");
const path = require("path");
const { createFakeFirestore, loadWithFake, requiredIndex } = require("./helpers/fakeFirestore");
void createFakeFirestore;

const APIUSAGE = path.join(__dirname, "..", "apiUsage.js");
const MODEL = "claude-sonnet-5-5";
const OP = { provider: "anthropic", operation: "analyzeBusinessServices" };

function setup({ indexes } = {}) {
  const fake = createFakeFirestore({ indexes });
  const { runGoverned, hashInput } = loadWithFake(fake, APIUSAGE);
  let calls = 0;
  const execute = async (input) => {
    calls++;
    return { result: [{ name: `result-${calls}`, from: input }], usage: { actualCostUsd: 0.09, inputTokens: 10000, outputTokens: 7000 } };
  };
  const run = (businessId, input, extra = {}) => runGoverned({ ...OP, businessId, input, model: MODEL, execute, ...extra });
  return { fake, run, hashInput, calls: () => calls };
}

const inputA = { promptVersion: 3, ownerNames: ["אדריכלות"], pagesEvidence: [{ url: "https://www.example.co.il/", title: "x" }] };
const inputB = { promptVersion: 3, ownerNames: ["אדריכלות"], pagesEvidence: [{ url: "https://www.example.co.il/", title: "changed" }] };

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push(`PASS ${name}`);
  } catch (err) {
    results.push(`FAIL ${name}: ${err.message}`);
  }
}

(async () => {
  await test("A+B first run misses and calls once; identical run hits for $0 without calling", async () => {
    const t = setup();
    const r1 = await t.run("bizAB", inputA);
    assert.strictEqual(r1.decision, "cache_miss");
    assert.strictEqual(r1.providerCalled, true);
    assert.strictEqual(t.calls(), 1);
    const r2 = await t.run("bizAB", inputA);
    assert.strictEqual(r2.decision, "cache_hit");
    assert.strictEqual(r2.cacheHit, true);
    assert.strictEqual(r2.providerCalled, false);
    assert.strictEqual(t.calls(), 1, "second identical run must not call the provider");
    assert.deepStrictEqual(r2.result, r1.result, "hit returns the stored result");
    assert.strictEqual(r2.inputHash, r1.inputHash);
    const hitRow = t.fake.rows("apiUsage").find((r) => r.status === "cache_hit");
    assert.ok(hitRow, "cache hit is recorded in the ledger");
    assert.strictEqual(hitRow.actualCostUsd, 0);
    assert.strictEqual(hitRow.providerCalled, false);
    assert.strictEqual(hitRow.model, MODEL);
  });

  await test("C explicit force refresh calls the provider even with a valid cached result", async () => {
    const t = setup();
    await t.run("bizC", inputA);
    const r = await t.run("bizC", inputA, { forceRefresh: true });
    assert.strictEqual(r.decision, "forced_refresh");
    assert.strictEqual(r.providerCalled, true);
    assert.strictEqual(t.calls(), 2);
    const row = t.fake.rows("apiUsage").filter((x) => x.status === "success").pop();
    assert.strictEqual(row.forceRefresh, true, "the forced call is marked on its ledger row");
  });

  await test("E1 cache lookup outage fails CLOSED - provider never called", async () => {
    const t = setup();
    t.fake.failNextQueries(1);
    const r = await t.run("bizE1", inputA);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.decision, "blocked_cache_unavailable");
    assert.strictEqual(r.providerCalled, false);
    assert.strictEqual(t.calls(), 0);
    assert.ok(t.fake.rows("apiUsage").some((x) => x.status === "blocked_cache_unavailable"));
  });

  await test("E2 missing cache index (the 2026-10-07 production bug) fails CLOSED", async () => {
    const real = JSON.parse(require("fs").readFileSync(path.join(__dirname, "..", "..", "firestore.indexes.json"), "utf8")).indexes;
    const withoutCacheIndex = real.filter(
      (idx) => !(idx.collectionGroup === "apiUsage" && idx.fields.some((f) => f.fieldPath === "inputHash"))
    );
    const t = setup({ indexes: withoutCacheIndex });
    const r = await t.run("bizE2", inputA);
    assert.strictEqual(r.decision, "blocked_cache_unavailable");
    assert.match(r.blocked.message, /FAILED_PRECONDITION/);
    assert.strictEqual(t.calls(), 0, "a missing index must never fall through into a paid call");
  });

  await test("E3 budget/quota check that cannot run fails CLOSED", async () => {
    const t = setup();
    t.fake.failQueriesAfter(1); // the cache lookup (query 1) works and misses; the budget queries fail
    const r = await t.run("bizE3", inputA);
    assert.strictEqual(r.decision, "blocked_safety_check_unavailable");
    assert.strictEqual(r.providerCalled, false);
    assert.strictEqual(t.calls(), 0, "a failed budget check must never fall through into a paid call");
  });

  await test("F changed input misses and calls the provider", async () => {
    const t = setup();
    const r1 = await t.run("bizF", inputA);
    const r2 = await t.run("bizF", inputB);
    assert.notStrictEqual(r2.inputHash, r1.inputHash);
    assert.strictEqual(r2.decision, "cache_miss");
    assert.strictEqual(t.calls(), 2);
  });

  await test("G same input, different prompt version misses", async () => {
    const t = setup();
    await t.run("bizG", inputA);
    const r = await t.run("bizG", { ...inputA, promptVersion: 4 });
    assert.strictEqual(r.decision, "cache_miss");
    assert.strictEqual(t.calls(), 2);
  });

  await test("H same input, different model misses", async () => {
    const t = setup();
    await t.run("bizH", inputA);
    const r = await t.run("bizH", inputA, { model: "claude-opus-5-5" });
    assert.strictEqual(r.decision, "cache_miss");
    assert.strictEqual(r.inputHash, t.hashInput(inputA), "the input hash itself is unchanged - the model is a separate part of the identity");
    assert.strictEqual(t.calls(), 2);
  });

  await test("H2 same input, different analysis version misses; legacy rows count as v1", async () => {
    const t = setup();
    t.fake.seed("apiUsage", {
      ...OP, businessId: "bizH2", inputHash: t.hashInput(inputA), status: "success", cacheHit: false,
      result: [{ name: "legacy" }], retrievedAtMs: Date.now() - 1000
    });
    const v1 = await t.run("bizH2", inputA, { analysisVersion: 1 });
    assert.strictEqual(v1.decision, "cache_hit", "a row with no analysisVersion is the legacy v1");
    const v2 = await t.run("bizH2", inputA, { analysisVersion: 2 });
    assert.strictEqual(v2.decision, "cache_miss", "a new analysis version invalidates the cached result");
    assert.strictEqual(t.calls(), 1);
  });

  await test("failed but billed provider call is recorded with its real tokens and cost", async () => {
    const fake = createFakeFirestore();
    const { runGoverned } = loadWithFake(fake, APIUSAGE);
    const execute = async () => {
      throw Object.assign(new Error("AI reply was cut off"), { usage: { inputTokens: 10377, outputTokens: 12000, requestId: "msg_x", actualCostUsd: 0.1408 } });
    };
    await assert.rejects(runGoverned({ ...OP, businessId: "bizErr", input: inputA, model: MODEL, execute }));
    const row = fake.rows("apiUsage").find((r) => r.status === "error");
    assert.strictEqual(row.providerCalled, true);
    assert.strictEqual(row.actualCostUsd, 0.1408);
    assert.strictEqual(row.inputTokens, 10377);
    assert.strictEqual(row.decision, "cache_miss");
    const again = await runGoverned({ ...OP, businessId: "bizErr", input: inputA, model: MODEL, execute: async () => ({ result: [1], usage: {} }) });
    assert.strictEqual(again.decision, "cache_miss", "a failed call is never cached as a result");
  });

  await test("every ledger row records its decision", async () => {
    const t = setup();
    await t.run("bizDec", inputA);
    await t.run("bizDec", inputA);
    const decisions = t.fake.rows("apiUsage").map((r) => `${r.status}:${r.decision}`);
    assert.deepStrictEqual(decisions, ["success:cache_miss", "cache_hit:cache_hit"]);
  });

  await test("I returning to a previous input state reuses its earlier result", async () => {
    const t = setup();
    const a1 = await t.run("bizI", inputA);
    await t.run("bizI", inputB);
    const a2 = await t.run("bizI", inputA);
    assert.strictEqual(a2.decision, "cache_hit");
    assert.deepStrictEqual(a2.result, a1.result);
    assert.strictEqual(t.calls(), 2);
  });

  await test("existing pre-fix ledger row (no model field) is reused for the legacy model only", async () => {
    const t = setup();
    // Shape of the real f0a61e51… rows written before this fix: no `model`,
    // no `providerCalled`.
    t.fake.seed("apiUsage", {
      ...OP,
      businessId: "bizLegacy",
      inputHash: t.hashInput(inputA),
      status: "success",
      cacheHit: false,
      result: [{ name: "from-legacy-row" }],
      actualCostUsd: 0.0917,
      retrievedAtMs: Date.now() - 3 * 60 * 60 * 1000
    });
    // Exactly what businessUnderstanding.js sends in production.
    const r = await t.run("bizLegacy", inputA, { analysisVersion: 1 });
    assert.strictEqual(r.decision, "cache_hit", "the existing paid result must be reusable after the fix");
    assert.deepStrictEqual(r.result, [{ name: "from-legacy-row" }]);
    assert.strictEqual(t.calls(), 0);
    const other = await t.run("bizLegacy", inputA, { model: "claude-opus-5-5", analysisVersion: 1 });
    assert.strictEqual(other.decision, "cache_miss", "a legacy row is never reused for a different model");
  });

  await test("cache hits and blocked attempts do not consume the request quota", async () => {
    const t = setup();
    await t.run("bizQ", inputA); // 1 real call
    for (let i = 0; i < 10; i++) await t.run("bizQ", inputA); // 10 hits
    t.fake.failNextQueries(3); // 3 lookups fail closed -> blocked rows
    for (let i = 0; i < 3; i++) await t.run("bizQ", inputB);
    // per-business daily limit is 5: four more distinct real calls must still be allowed
    for (let i = 0; i < 4; i++) {
      const r = await t.run("bizQ", { ...inputA, promptVersion: 100 + i });
      assert.strictEqual(r.providerCalled, true, `real call ${i + 2} should be within quota`);
    }
    const blocked = await t.run("bizQ", { ...inputA, promptVersion: 999 });
    assert.strictEqual(blocked.decision, "blocked_by_quota", "6th real call hits the limit of 5");
  });

  await test("every query runGoverned makes has a matching declared index", async () => {
    const t = setup();
    await t.run("bizIdx", inputA);
    await t.run("bizIdx", inputA);
    for (const q of t.fake.queryLog) {
      // If any of these needed an undeclared index, the run above would have
      // been blocked; assert explicitly for a clear message.
      const filters = q.filters.map((f) => ({ field: f.replace(/(==|>=)$/, ""), op: f.endsWith(">=") ? ">=" : "==" }));
      requiredIndex(q.collection, filters, q.order); // throws only on unsupported shapes
    }
    assert.ok(t.fake.rows("apiUsage").every((r) => !String(r.status).startsWith("blocked")));
  });

  console.log(results.join("\n"));
  const failed = results.filter((r) => r.startsWith("FAIL"));
  console.log(failed.length ? `\n${failed.length} cost-control test(s) FAILED.` : "\nAll cost-control regression tests passed.");
  process.exit(failed.length ? 1 : 0);
})();
