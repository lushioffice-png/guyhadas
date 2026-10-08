import type { ReactNode } from "react";

export type StatusTone = "good" | "warn" | "bad" | "neutral";

// Plain-language status: glyph + text (never color alone).
const GLYPH: Record<StatusTone, string> = { good: "✓", warn: "!", bad: "✕", neutral: "–" };

export function StatusPill({ tone, children, title }: { tone: StatusTone; children: ReactNode; title?: string }) {
  return (
    <span className={`status-pill ${tone}`} title={title}>
      <span aria-hidden="true">{GLYPH[tone]}</span>
      {children}
    </span>
  );
}
