import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "accent" | "warn" | "danger" | "info" | "outline";

// Generic pill badge. Meaning is always carried by the text (and usually an
// icon glyph), never by color alone.
export function Badge({ tone = "neutral", icon, title, children }: { tone?: BadgeTone; icon?: string; title?: string; children: ReactNode }) {
  return (
    <span className={`badge tone-${tone}`} title={title}>
      {icon && <span className="badge-icon" aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}
