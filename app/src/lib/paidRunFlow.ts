// State for an action that may call a paid external API (Claude, Semrush).
//
// Safe by default: a normal run never bypasses the cache. A paid "new run"
// only happens after the owner explicitly confirms it in a dialog, applies
// to that one run only, and is cleared as soon as the run starts - there is
// no persistent "force" setting that could silently stay on.
//
// Pure reducer so the guarantee is testable (app/test/paidRunFlow.test.ts).

export type PaidRunPhase = "idle" | "confirming" | "running";

export interface PaidRunState {
  phase: PaidRunPhase;
  // Only true between "confirm" and the run that consumes it.
  pendingForce: boolean;
}

export type PaidRunAction =
  | { type: "start" } // normal run - cache first, never forced
  | { type: "requestNewRun" } // open the confirmation dialog
  | { type: "cancel" } // close the dialog, nothing runs
  | { type: "confirmNewRun" } // owner explicitly accepts a paid new run
  | { type: "finished" };

export const initialPaidRunState: PaidRunState = { phase: "idle", pendingForce: false };

export function paidRunReducer(state: PaidRunState, action: PaidRunAction): PaidRunState {
  switch (action.type) {
    case "start":
      return state.phase === "running" ? state : { phase: "running", pendingForce: false };
    case "requestNewRun":
      return state.phase === "running" ? state : { phase: "confirming", pendingForce: false };
    case "cancel":
      return { phase: "idle", pendingForce: false };
    case "confirmNewRun":
      return state.phase === "confirming" ? { phase: "running", pendingForce: true } : state;
    case "finished":
      return { phase: "idle", pendingForce: false };
  }
}

// Whether the run being started right now should bypass the cache. Only
// true for the single run that directly follows an explicit confirmation.
export function runIsForced(state: PaidRunState): boolean {
  return state.phase === "running" && state.pendingForce;
}
