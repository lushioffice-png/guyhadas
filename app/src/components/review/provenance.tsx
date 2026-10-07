import { Badge } from "./Badge";
import type { FacetProvenance, ServiceOwnerStatus, ServiceSource } from "../../types";

// The three provenance types, kept explicitly distinct everywhere: distinct
// label, glyph, color and explanation. Owner and website are never shown as
// the same thing.
export const PROVENANCE_META: Record<FacetProvenance, { label: string; icon: string; explain: string }> = {
  owner: {
    label: "בעל/ת העסק",
    icon: "●",
    explain: "הוזן ישירות על ידי בעל/ת העסק (בהקמת העסק או ידנית)."
  },
  website: {
    label: "מהאתר",
    icon: "◆",
    explain: "הביטוי נמצא כלשונו בטקסט של עמוד באתר, ונבדק מול התוכן שנסרק."
  },
  ai_inference: {
    label: "פרשנות AI",
    icon: "~",
    explain: "פרשנות של המערכת על סמך תוכן האתר - לא בהכרח ביטוי שמופיע באתר כלשונו."
  }
};

const PROVENANCE_TONE: Record<FacetProvenance, "accent" | "info" | "outline"> = {
  owner: "accent",
  website: "info",
  ai_inference: "outline"
};

export function ProvenanceBadge({ provenance }: { provenance: FacetProvenance }) {
  const meta = PROVENANCE_META[provenance];
  return (
    <Badge tone={PROVENANCE_TONE[provenance]} icon={meta.icon} title={meta.explain}>
      {meta.label}
    </Badge>
  );
}

// Item-level origin of a Service Map item (its `source` field). An item the
// AI proposed is labelled as such; individual facet values below it carry
// their own value-level provenance.
export function ServiceSourceBadges({ source }: { source: ServiceSource }) {
  if (source === "owner") return <ProvenanceBadge provenance="owner" />;
  if (source === "website") return <ProvenanceBadge provenance="website" />;
  if (source === "combined") {
    return (
      <>
        <ProvenanceBadge provenance="owner" />
        <Badge tone="info" icon="◆" title="ניתוח האתר הוסיף עדויות ופירוק מבני לפריט שהוזן על ידי בעל/ת העסק.">
          + עדויות מהאתר
        </Badge>
      </>
    );
  }
  return (
    <Badge tone="outline" icon="~" title="פריט שהמערכת הציעה מתוך ניתוח תוכן האתר. ממתין לאישורך לפני שישמש בהמשך.">
      הצעת AI מתוך האתר
    </Badge>
  );
}

const STATUS_META: Record<ServiceOwnerStatus, { label: string; icon: string; tone: "warn" | "accent" | "neutral" }> = {
  needs_review: { label: "ממתין לבדיקה", icon: "!", tone: "warn" },
  confirmed: { label: "מאושר", icon: "✓", tone: "accent" },
  rejected: { label: "נדחה", icon: "✕", tone: "neutral" }
};

export function ReviewStatusBadge({ status }: { status: ServiceOwnerStatus }) {
  const meta = STATUS_META[status];
  return (
    <Badge tone={meta.tone} icon={meta.icon}>
      {meta.label}
    </Badge>
  );
}
