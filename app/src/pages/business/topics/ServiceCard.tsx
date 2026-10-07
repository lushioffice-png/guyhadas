import { useState } from "react";
import {
  updateServiceStatus,
  updateServicePriority,
  updateServiceDetails,
  deleteBusinessService
} from "../../../lib/firestore";
import { PRIORITY_LABELS, FACET_DIMENSION_LABELS } from "../../../types";
import type { BusinessService, FacetDimension, FacetValue, TaskPriority } from "../../../types";
import { ServiceSourceBadges, ReviewStatusBadge, ProvenanceBadge, PROVENANCE_META } from "../../../components/review/provenance";
import { Badge } from "../../../components/review/Badge";
import { ConfirmDeleteButton } from "../../../components/review/ConfirmDeleteButton";
import { SourceLink } from "../../../components/review/SourceLink";

// Order the structured dimensions appear in. Empty ones are never shown.
const FACET_ORDER: FacetDimension[] = [
  "services",
  "projectTypes",
  "markets",
  "audiences",
  "offerings",
  "positioning",
  "geographies",
  "needs"
];

function FacetChip({ value }: { value: FacetValue }) {
  const meta = PROVENANCE_META[value.provenance];
  const pages = value.foundOn && value.foundOn.length > 0 ? value.foundOn : value.sourceUrl ? [value.sourceUrl] : [];
  const tooltip = [`${meta.label}: ${meta.explain}`, ...pages.map((u) => `עמוד: ${u}`)].join("\n");
  return (
    <span className={`facet-chip prov-${value.provenance}`} title={tooltip}>
      <span className="prov-mark" aria-label={meta.label}>{meta.icon}</span>
      {value.value}
    </span>
  );
}

function Facets({ service }: { service: BusinessService }) {
  const facets = service.facets;
  const dims = FACET_ORDER.filter((d) => facets?.[d] && facets[d]!.length > 0);
  if (dims.length === 0) {
    return (
      <p className="text-dim" style={{ fontSize: "0.85rem", margin: "var(--space-3) 0 0" }}>
        עדיין אין פירוק מבני לפריט הזה - הוא יתווסף בניתוח הבא של העסק והאתר.
      </p>
    );
  }
  return (
    <div className="facet-grid">
      {dims.map((d) => (
        <div key={d} style={{ display: "contents" }}>
          <div className="facet-label">{FACET_DIMENSION_LABELS[d]}</div>
          <div className="facet-values">
            {facets![d]!.map((v) => (
              <FacetChip key={`${d}-${v.value}`} value={v} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Evidence({ service }: { service: BusinessService }) {
  const sources = service.evidenceSources || [];
  const legacy = sources.length === 0 ? service.evidence || [] : [];
  return (
    <ol className="evidence-list">
      {sources.map((e, i) => (
        <li key={i} className="evidence-item">
          <div className="text-dim" style={{ fontSize: "0.75rem", fontWeight: 700, marginBottom: 4 }}>עדות {i + 1}</div>
          <blockquote className="evidence-quote">"{e.quote}"</blockquote>
          <div className="evidence-meta">
            {e.sourceUrl ? (
              <>
                <span>מקור:</span>
                <SourceLink url={e.sourceUrl} />
              </>
            ) : (
              <span>לא נקשר לעמוד מסוים</span>
            )}
            {(e.provenance ? e.provenance === "website" : e.verified) ? (
              <Badge tone="info" icon="◆" title="הציטוט נמצא כלשונו בטקסט של העמוד שנסרק.">נמצא בעמוד</Badge>
            ) : (
              <Badge tone="outline" icon="~" title="הציטוט לא נמצא כלשונו בטקסט שנסרק - ייתכן שזו פרפרזה של ה-AI.">לא אומת מול טקסט העמוד</Badge>
            )}
          </div>
        </li>
      ))}
      {legacy.map((q, i) => (
        <li key={`legacy-${i}`} className="evidence-item">
          <blockquote className="evidence-quote">"{q}"</blockquote>
          <div className="evidence-meta">
            <span>עמוד המקור לא תועד (נשמר לפני שתיעוד העמוד נוסף). יתעדכן בניתוח הבא.</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function ServiceCard({ service }: { service: BusinessService }) {
  const [showEvidence, setShowEvidence] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(service.name);
  const [description, setDescription] = useState(service.description || "");
  const [saving, setSaving] = useState(false);

  const evidenceCount = (service.evidenceSources?.length || 0) || (service.evidence?.length || 0);
  const statusClass = service.ownerStatus === "needs_review" ? "needs-review" : service.ownerStatus;

  async function saveEdit() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await updateServiceDetails(service.id, { name: name.trim(), description: description.trim() }, service.name);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className={`record-card ${statusClass}`}>
      <div className="record-head">
        <div style={{ minWidth: 0, flex: 1 }}>
          {editing ? (
            <div className="edit-fields">
              <input value={name} onChange={(e) => setName(e.target.value)} aria-label="שם" />
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} aria-label="תיאור" placeholder="תיאור (אופציונלי)" />
            </div>
          ) : (
            <h4 className="record-title">{service.name}</h4>
          )}
          <div className="record-badges">
            <ReviewStatusBadge status={service.ownerStatus} />
            <ServiceSourceBadges source={service.source} />
          </div>
        </div>
        {service.ownerStatus !== "rejected" && (
          <label className="inline-field-label">
            עדיפות
            <select
              className="select-quiet"
              value={service.priority}
              onChange={(e) => updateServicePriority(service.id, e.target.value as TaskPriority)}
            >
              {Object.entries(PRIORITY_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {!editing && service.description && <p className="record-desc">{service.description}</p>}

      <Facets service={service} />

      {showEvidence && <Evidence service={service} />}

      <div className="record-foot">
        <div className="record-actions">
          {editing ? (
            <>
              <button type="button" className="btn btn-confirm btn-sm" disabled={saving || !name.trim()} onClick={saveEdit}>
                {saving ? "שומר…" : "שמירה"}
              </button>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                onClick={() => {
                  setEditing(false);
                  setName(service.name);
                  setDescription(service.description || "");
                }}
              >
                ביטול
              </button>
            </>
          ) : (
            <>
              {service.ownerStatus === "needs_review" && (
                <>
                  <button type="button" className="btn btn-confirm btn-sm" onClick={() => updateServiceStatus(service.id, "confirmed")}>
                    ✓ אישור
                  </button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => updateServiceStatus(service.id, "rejected")}>
                    דחייה
                  </button>
                </>
              )}
              {service.ownerStatus === "confirmed" && (
                <>
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => updateServiceStatus(service.id, "needs_review")}>
                    החזרה לבדיקה
                  </button>
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => updateServiceStatus(service.id, "rejected")}>
                    דחייה
                  </button>
                </>
              )}
              {service.ownerStatus === "rejected" && (
                <button type="button" className="btn btn-outline btn-sm" onClick={() => updateServiceStatus(service.id, "needs_review")}>
                  שחזור לבדיקה
                </button>
              )}
              {service.ownerStatus !== "rejected" && (
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditing(true)}>
                  עריכה
                </button>
              )}
              <ConfirmDeleteButton
                onConfirm={() => deleteBusinessService(service.id)}
                note={
                  service.ownerStatus === "rejected"
                    ? "מחיקה מסירה גם את הסימון כנדחה - הניתוח הבא עלול להציע אותו שוב."
                    : "הניתוח הבא עלול ליצור אותו מחדש. כדי שלא יחזור - השתמש/י ב'דחייה'."
                }
              />
            </>
          )}
        </div>
        {evidenceCount > 0 ? (
          <button type="button" className="disclosure" aria-expanded={showEvidence} onClick={() => setShowEvidence((v) => !v)}>
            עדויות ומקורות ({evidenceCount}) <span className="chev" aria-hidden="true">▾</span>
          </button>
        ) : (
          <span className="text-dim" style={{ fontSize: "0.8rem" }}>
            {service.source === "owner" ? "הוזן ע״י בעל/ת העסק - אין עדויות מהאתר" : "אין עדויות"}
          </span>
        )}
      </div>
    </article>
  );
}

// Re-exported for the legend in the section header.
export { ProvenanceBadge };
