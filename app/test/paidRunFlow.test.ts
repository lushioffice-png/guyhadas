// Scenario D (M3.1 cost-control acceptance): the force-refresh control
// never stays active after an operation, and is never the default.
// Run with: node --experimental-strip-types app/test/paidRunFlow.test.ts
import assert from "node:assert";
import { initialPaidRunState, paidRunReducer, runIsForced, type PaidRunAction, type PaidRunState } from "../src/lib/paidRunFlow.ts";

const apply = (s: PaidRunState, ...actions: PaidRunAction[]) => actions.reduce(paidRunReducer, s);

// Default: a normal run is never forced.
let s = apply(initialPaidRunState, { type: "start" });
assert.strictEqual(runIsForced(s), false, "normal run must not be forced");

// Explicit confirmation forces exactly that run.
s = apply(initialPaidRunState, { type: "requestNewRun" }, { type: "confirmNewRun" });
assert.strictEqual(runIsForced(s), true, "confirmed new run is forced");

// D: after it finishes, the next normal run is NOT forced.
s = apply(s, { type: "finished" }, { type: "start" });
assert.strictEqual(runIsForced(s), false, "force must not persist after the operation");

// Cancelling the dialog never forces anything.
s = apply(initialPaidRunState, { type: "requestNewRun" }, { type: "cancel" }, { type: "start" });
assert.strictEqual(runIsForced(s), false, "cancelled confirmation must not force the next run");

// Confirm without the dialog having been opened does nothing.
s = apply(initialPaidRunState, { type: "confirmNewRun" });
assert.strictEqual(s.phase, "idle");
assert.strictEqual(runIsForced(s), false);

// Starting a normal run while confirming discards the pending dialog.
s = apply(initialPaidRunState, { type: "requestNewRun" }, { type: "start" });
assert.strictEqual(runIsForced(s), false);

console.log("All paid-run flow checks passed (force is explicit, single-use, never persistent).");
