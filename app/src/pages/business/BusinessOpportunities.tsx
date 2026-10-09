import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { EmptyState } from "../../components/EmptyState";
import { AddOpportunityModal } from "../../components/AddOpportunityModal";
import { listenOpportunities, updateOpportunity, deleteOpportunity } from "../../lib/firestore";
import { OPPORTUNITY_STATUS_LABELS, PRIORITY_LABELS } from "../../types";
import type { Opportunity, OpportunityStatus } from "../../types";
import type { BusinessContext } from "./BusinessWorkspace";
import { EngineOpportunities } from "./EngineOpportunities";

export default function BusinessOpportunities() {
  const { business } = useOutletContext<BusinessContext>();
  const [all, setAll] = useState<Opportunity[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    if (!business) return;
    return listenOpportunities(business.id, setAll);
  }, [business]);

  if (!business) return <div className="loading-row">טוען…</div>;

  // Engine opportunities (M5) and manual ones share the collection.
  const engine = (all || []).filter((o) => o.source === "opportunity_engine");
  const opportunities = all === null ? null : all.filter((o) => o.source !== "opportunity_engine");

  async function handleStatusChange(id: string, status: OpportunityStatus) {
    await updateOpportunity(id, { status });
  }

  async function handleDelete(id: string, title: string) {
    if (confirm(`למחוק את ההזדמנות "${title}"?`)) {
      await deleteOpportunity(id);
    }
  }

  return (
    <div>
    <EngineOpportunities businessId={business.id} opportunities={engine} />
    <div className="section-block" style={{ marginTop: "var(--space-7)" }}>
      <div className="table-toolbar">
        <h2 className="section-title" style={{ marginBottom: 0 }}>הזדמנויות ידניות</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ הזדמנות חדשה</button>
      </div>

      {opportunities === null && <div className="loading-row">טוען…</div>}

      {opportunities && opportunities.length === 0 && (
        <EmptyState
          title="אין עדיין הזדמנויות"
          subtitle="אפשר להוסיף כאן הזדמנויות משלך, בנוסף לאלה שהמערכת מזהה."
          action={<button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ הזדמנות חדשה</button>}
        />
      )}

      {opportunities && opportunities.length > 0 && (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>כותרת</th>
                <th>נושא / מילת חיפוש</th>
                <th>עדיפות</th>
                <th>ערך פוטנציאלי</th>
                <th>סטטוס</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {opportunities.map((o) => (
                <tr key={o.id}>
                  <td>
                    <strong>{o.title}</strong>
                    {o.description && <div className="text-muted" style={{ fontSize: "0.78rem", marginTop: 2 }}>{o.description}</div>}
                  </td>
                  <td className="text-muted">{o.topic || o.query || "—"}</td>
                  <td>{PRIORITY_LABELS[o.priority]}</td>
                  <td className="text-muted">{o.potentialValue || "—"}</td>
                  <td>
                    <select
                      value={o.status}
                      onChange={(e) => handleStatusChange(o.id, e.target.value as OpportunityStatus)}
                      style={{ background: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "4px 8px", fontSize: "0.8rem" }}
                    >
                      {Object.entries(OPPORTUNITY_STATUS_LABELS).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button className="btn btn-danger-outline btn-sm" onClick={() => handleDelete(o.id, o.title)}>מחיקה</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <AddOpportunityModal businessId={business.id} onClose={() => setShowAdd(false)} onCreated={() => setShowAdd(false)} />
      )}
    </div>
    </div>
  );
}
