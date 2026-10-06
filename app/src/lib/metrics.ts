// Shared helpers for comparing a snapshot series against a business's
// baseline date (Milestone 3). A business's baselineDate (set once, from
// the Overview tab) marks "day zero" for comparisons - these helpers find
// the first snapshot at/after that date and diff it against the latest one.

export interface DeltaResult {
  direction: "up" | "down" | "flat";
  text: string;
}

export function timestampToMillis(value: unknown): number | null {
  const ts = value as { toMillis?: () => number } | null | undefined;
  return ts?.toMillis?.() ?? null;
}

export function formatTimestamp(value: unknown): string | null {
  const ts = value as { toDate?: () => Date } | null | undefined;
  if (!ts?.toDate) return null;
  return ts.toDate().toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });
}

export function findBaselineSnapshot<T extends { retrievedAt: unknown }>(
  snapshots: T[],
  baselineDate: string | null | undefined
): T | null {
  if (!baselineDate || snapshots.length === 0) return null;
  const baselineMs = new Date(baselineDate).getTime();
  if (Number.isNaN(baselineMs)) return null;

  for (const snap of snapshots) {
    const ms = timestampToMillis(snap.retrievedAt);
    if (ms !== null && ms >= baselineMs) return snap;
  }
  return null;
}

export function computeDelta(current: number, baseline: number | null): DeltaResult | undefined {
  if (baseline === null) return undefined;
  if (baseline === 0) {
    return current === 0
      ? { direction: "flat", text: "ללא שינוי מאז הבייסליין" }
      : { direction: "up", text: "חדש מאז הבייסליין" };
  }
  const rounded = Math.round(((current - baseline) / baseline) * 100);
  if (rounded === 0) return { direction: "flat", text: "ללא שינוי מאז הבייסליין" };
  return {
    direction: rounded > 0 ? "up" : "down",
    text: `${rounded > 0 ? "+" : ""}${rounded}% מאז הבייסליין`
  };
}
