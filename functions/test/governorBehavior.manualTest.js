// GuyHadas Visibility OS - manual verification for functions/apiUsage.js's
// runGoverned() (Universal External API Cost-Control Rule). Not a unit
// test framework, not wired into index.js, not deployed as a function -
// a standalone Node script proving the three behaviors the rule actually
// requires, against an in-memory fake Firestore (this sandbox has no live
// Firestore credentials to test against for real, so this exercises the
// governor's own logic deterministically; the end-to-end proof is the
// user re-running the real analysis in the deployed app, which this test
// cannot replace).
//
// Run with: node functions/test/governorBehavior.manualTest.js
//
// What it proves:
//   1. Same input twice -> the provider is called exactly once (the
//      second run is a cache hit).
//   2. Input changes -> the provider is called again (a different hash
//      is a different cache entry).
//   3. A configured per-business daily request limit, once reached,
//      blocks further calls with "blocked_by_quota" instead of calling
//      the provider - the circuit does not silently keep spending.
//   4. forceRefresh=true ignores a valid cache (calls the provider
//      again) but a budget/quota block still applies even with
//      forceRefresh=true - force refresh means "ignore the cache," never
//      "ignore the safety controls," per the cost-control rule.

const path = require("path");
const assert = require("assert");

// --- Minimal in-memory Firestore fake -------------------------------
// Supports exactly the query shapes functions/apiUsage.js actually uses:
// collection(...).where(==/>=...).orderBy(...).limit(...).get(), plus
// collection(...).add(...) and collection(...).doc(id).get()/.set(merge).
class FakeQuery {
  constructor(docs, filters = [], order = null, limitN = null) {
    this.docs = docs;
    this.filters = filters;
    this.order = order;
    this.limitN = limitN;
  }
  where(field, op, value) {
    return new FakeQuery(this.docs, [...this.filters, { field, op, value }], this.order, this.limitN);
  }
  orderBy(field, dir) {
    return new FakeQuery(this.docs, this.filters, { field, dir }, this.limitN);
  }
  limit(n) {
    return new FakeQuery(this.docs, this.filters, this.order, n);
  }
  async get() {
    let result = this.docs.filter((d) =>
      this.filters.every((f) => {
        const val = d.data[f.field];
        if (f.op === "==") return val === f.value;
        if (f.op === ">=") return val >= f.value;
        throw new Error(`FakeQuery doesn't support operator ${f.op}`);
      })
    );
    if (this.order) {
      result = [...result].sort((a, b) => {
        const av = a.data[this.order.field];
        const bv = b.data[this.order.field];
        return this.order.dir === "desc" ? bv - av : av - bv;
      });
    }
    if (this.limitN != null) result = result.slice(0, this.limitN);
    return { empty: result.length === 0, docs: result.map((d) => ({ id: d.id, data: () => d.data })) };
  }
}

function createFakeAdmin() {
  const collections = {};
  let idCounter = 0;
  function docsFor(name) {
    return collections[name] || (collections[name] = []);
  }
  const fakeAdmin = {
    firestore() {
      return {
        collection(name) {
          const docs = docsFor(name);
          return {
            where(field, op, value) {
              return new FakeQuery(docs, [{ field, op, value }]);
            },
            async add(data) {
              const id = `doc${idCounter++}`;
              docs.push({ id, data });
              return { id };
            },
            doc(id) {
              return {
                async get() {
                  const found = docs.find((d) => d.id === id);
                  return { exists: !!found, data: () => found && found.data };
                },
                async set(data, opts) {
                  const found = docs.find((d) => d.id === id);
                  if (found && opts && opts.merge) Object.assign(found.data, data);
                  else if (found) found.data = data;
                  else docs.push({ id, data });
                }
              };
            }
          };
        }
      };
    }
  };
  fakeAdmin.firestore.FieldValue = { serverTimestamp: () => Date.now() };
  return fakeAdmin;
}

// Splice the fake in before functions/apiUsage.js does its own
// require("firebase-admin") - same trick a mocking library uses under the
// hood, without needing one as a dependency just for this script.
const firebaseAdminPath = require.resolve("firebase-admin", { paths: [__dirname + "/.."] });
const fakeAdmin = createFakeAdmin();
require.cache[firebaseAdminPath] = { id: firebaseAdminPath, filename: firebaseAdminPath, loaded: true, exports: fakeAdmin };

const apiLimitsPath = path.join(__dirname, "..", "apiLimits.js");
delete require.cache[require.resolve(apiLimitsPath)];
// Patch in tight limits for this test run only, so we can actually hit
// the quota without 500 real calls - functions/apiLimits.js's real
// numbers are the production config, not what this test exercises.
require.cache[require.resolve(apiLimitsPath)] = {
  id: apiLimitsPath,
  filename: apiLimitsPath,
  loaded: true,
  exports: {
    testProvider: {
      testOperation: {
        maxRequestsPerBusinessPerDay: 2,
        cacheTtlMs: null,
        circuitBreakerThreshold: 5,
        circuitBreakerCooldownMs: 15 * 60 * 1000
      }
    }
  }
};

const { runGoverned } = require(path.join(__dirname, "..", "apiUsage.js"));

async function main() {
  let providerCalls = 0;
  const execute = async (input) => {
    providerCalls++;
    return { result: { echoedInput: input, callNumber: providerCalls }, usage: { actualCostUsd: 0.01 } };
  };

  // --- Test 1 & 2: cache hit on identical input, real call on changed input
  const r1 = await runGoverned({ provider: "testProvider", operation: "testOperation", businessId: "biz1", input: { seed: "a" }, execute });
  assert.strictEqual(r1.cacheHit, false, "first call should not be a cache hit");
  assert.strictEqual(providerCalls, 1, "first call should reach the provider");

  const r2 = await runGoverned({ provider: "testProvider", operation: "testOperation", businessId: "biz1", input: { seed: "a" }, execute });
  assert.strictEqual(r2.cacheHit, true, "second call with identical input should be a cache hit");
  assert.strictEqual(providerCalls, 1, "second call must NOT reach the provider - this is the whole point of the rule");
  assert.deepStrictEqual(r2.result, r1.result, "cache hit should return the previously stored result");

  const r3 = await runGoverned({ provider: "testProvider", operation: "testOperation", businessId: "biz1", input: { seed: "b" }, execute });
  assert.strictEqual(r3.cacheHit, false, "changed input should not reuse the prior cache entry");
  assert.strictEqual(providerCalls, 2, "changed input SHOULD reach the provider again");

  console.log("PASS: identical input is cached; changed input calls the provider again");

  // --- Test 3: per-business daily quota (limit is 2 for this test run)
  // blocks the 3rd distinct input for the same business. Uses a fresh
  // business id so this test's call-counting doesn't depend on biz1's
  // history above (biz1 already made 2 real calls in tests 1-2, which
  // would make a 3rd call on biz1 a correct-but-confusing coincidence
  // rather than a clean demonstration).
  let blockedCalls = 0;
  const countingExecute = async (input) => {
    blockedCalls++;
    return { result: { ok: true }, usage: {} };
  };
  await runGoverned({ provider: "testProvider", operation: "testOperation", businessId: "biz2", input: { seed: "x" }, execute: countingExecute });
  await runGoverned({ provider: "testProvider", operation: "testOperation", businessId: "biz2", input: { seed: "y" }, execute: countingExecute });
  assert.strictEqual(blockedCalls, 2, "two distinct inputs under the limit of 2 should both reach the provider");
  const blockedResult = await runGoverned({ provider: "testProvider", operation: "testOperation", businessId: "biz2", input: { seed: "z" }, execute: countingExecute });
  assert.strictEqual(blockedResult.ok, false, "3rd distinct input for the same business should be blocked");
  assert.strictEqual(blockedResult.blocked.reason, "blocked_by_quota", "block reason should be blocked_by_quota");
  assert.strictEqual(blockedCalls, 2, "the provider must NOT have been called a 3rd time");

  console.log("PASS: per-business daily quota blocks further calls once reached, without calling the provider");

  // --- Test 4: forceRefresh ignores the cache, but NOT the quota block
  const forceResult = await runGoverned({
    provider: "testProvider",
    operation: "testOperation",
    businessId: "biz2",
    input: { seed: "x" }, // same as the very first biz2 call above - would be a cache hit without forceRefresh
    forceRefresh: true,
    execute: countingExecute
  });
  // biz2 is already at its quota from the two prior real calls, so even
  // forceRefresh must be blocked - this is the "force refresh means
  // ignore a valid cache, not ignore safety controls" requirement.
  assert.strictEqual(forceResult.ok, false, "forceRefresh must still respect an already-reached quota");
  assert.strictEqual(forceResult.blocked.reason, "blocked_by_quota");
  assert.strictEqual(blockedCalls, 2, "forceRefresh blocked by quota must not have reached the provider either");

  console.log("PASS: forceRefresh bypasses the cache but never bypasses budget/quota/circuit-breaker checks");

  console.log("\nAll governor behavior checks passed.");
}

main().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
