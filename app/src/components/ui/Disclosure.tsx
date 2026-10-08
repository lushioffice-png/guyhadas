import { useState, type ReactNode } from "react";

// Secondary information, closed by default ("פרטים טכניים", "הצג ראיות",
// "פירוט"). Content renders only when open.
export function Disclosure({ label, children, tone = "default", defaultOpen = false }: { label: string; children: ReactNode; tone?: "default" | "technical"; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`disclosure-block ${tone === "technical" ? "technical" : ""}`}>
      <button type="button" className="disclosure" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {label} <span className="chev" aria-hidden="true">▾</span>
      </button>
      {open && <div className="disclosure-body">{children}</div>}
    </div>
  );
}
