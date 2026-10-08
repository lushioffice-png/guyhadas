import { EmptyState } from "../../../components/EmptyState";
import { Disclosure } from "../../../components/ui/Disclosure";
import { StatusPill } from "../../../components/ui/StatusPill";
import { when } from "../../../lib/plainLanguage";
import type { Baseline } from "../../../types";

// Baselines are immutable snapshots. This tab only displays them and offers
// the existing "save a new version" action - behaviour unchanged.
export function BaselineTab({ baselines, onCapture, busy }: { baselines: Baseline[]; onCapture: () => void; busy: boolean }) {
  const latest = baselines[0] || null;
  const nextVersion = (latest?.version || 0) + 1;
  return (
    <div>
      <p className="tab-intro">
        בייסליין הוא צילום מצב שנשמר לפני שינויים באתר, כדי שאפשר יהיה בהמשך להשוות אליו. צילום שנשמר לא משתנה לעולם - שמירה נוספת
        יוצרת גרסה חדשה.
      </p>

      {latest ? (
        <div className="panel baseline-current">
          <div className="panel-row" style={{ justifyContent: "space-between" }}>
            <div>
              <div className="panel-title">הבייסליין העדכני: גרסה {latest.version}</div>
              <div className="panel-meta">נשמר {when(latest.capturedAtMs)}</div>
            </div>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={onCapture}>
              {busy ? "שומר…" : `שמירת גרסה ${nextVersion}`}
            </button>
          </div>
          <div className="kv-list" style={{ marginTop: "var(--space-4)" }}>
            <div className="kv"><span className="kv-label">נושאים</span><span className="kv-value">{latest.topics.length}</span></div>
            <div className="kv"><span className="kv-label">דפים</span><span className="kv-value">{latest.pages.length}</span></div>
            <div className="kv">
              <span className="kv-label">נתוני גוגל לתקופה</span>
              <span className="kv-value">{latest.availability.gscQueryPage === "available" && latest.period.gscQueryPage ? `${latest.period.gscQueryPage.startDate} – ${latest.period.gscQueryPage.endDate}` : "לא זמינים"}</span>
            </div>
            <div className="kv">
              <span className="kv-label">לעומת הגרסה הקודמת</span>
              <span className="kv-value">
                {latest.version === 1 ? (
                  <StatusPill tone="neutral">גרסה ראשונה</StatusPill>
                ) : latest.identicalToPrevious ? (
                  <StatusPill tone="neutral">ללא שינוי</StatusPill>
                ) : (
                  <StatusPill tone="good">יש שינויים</StatusPill>
                )}
              </span>
            </div>
          </div>
          {latest.availability.intelligenceRun === "not_available" && <p className="panel-meta">הגרסה נשמרה לפני שהורץ ניתוח, ולכן כוללת רק נתוני אתר כלליים.</p>}
        </div>
      ) : (
        <EmptyState title="עדיין לא נשמר בייסליין" subtitle="מומלץ להריץ ניתוח ואז לשמור בייסליין ראשון." />
      )}
      {!latest && (
        <button type="button" className="btn btn-outline" disabled={busy} onClick={onCapture} style={{ marginTop: "var(--space-4)" }}>
          {busy ? "שומר…" : "שמירת בייסליין ראשון"}
        </button>
      )}

      {baselines.length > 1 && (
        <Disclosure label={`גרסאות קודמות (${baselines.length - 1})`}>
          <div className="data-table-wrap">
            <table className="data-table compact-table">
              <thead><tr><th>גרסה</th><th>נשמרה</th><th>נושאים</th><th>דפים</th><th>לעומת הקודמת</th></tr></thead>
              <tbody>
                {baselines.slice(1).map((b) => (
                  <tr key={b.id}>
                    <td>{b.version}</td>
                    <td className="text-muted">{when(b.capturedAtMs)}</td>
                    <td>{b.topics.length}</td>
                    <td>{b.pages.length}</td>
                    <td className="text-muted">{b.version === 1 ? "ראשונה" : b.identicalToPrevious ? "ללא שינוי" : "יש שינויים"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Disclosure>
      )}

      {latest && (
        <Disclosure label="פרטים טכניים" tone="technical">
          <ul className="tech-list">
            <li>baselineId: {latest.baselineId} · immutable (create-only)</li>
            <li>contentHash: {latest.contentHash}</li>
            <li>sourceRunId: {latest.sourceRunId || "—"} · נשמר על ידי: {latest.capturedBy || "—"}</li>
            <li>availability: {Object.entries(latest.availability).map(([k, v]) => `${k}=${v}`).join(", ")}</li>
          </ul>
        </Disclosure>
      )}
    </div>
  );
}
