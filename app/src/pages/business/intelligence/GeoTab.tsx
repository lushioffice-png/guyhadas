import { EmptyState } from "../../../components/EmptyState";
import { StatusPill } from "../../../components/ui/StatusPill";
import { Disclosure } from "../../../components/ui/Disclosure";
import { GEO_COPY, GEO_STATUS } from "../../../lib/plainLanguage";
import type { IntelligenceRun } from "../../../types";

// GEO readiness as a checklist: is the business clear and machine-readable
// on its own website? Not a measurement of AI visibility.
export function GeoTab({ run }: { run: IntelligenceRun }) {
  const geo = run.geoReadiness;
  if (!geo) return <EmptyState title="אין עדיין נתונים" subtitle="הרץ/י ניתוח." />;
  const order = ["present", "partial", "missing", "unknown"];
  const signals = geo.signals.slice().sort((a, b) => order.indexOf(b.status) - order.indexOf(a.status));
  return (
    <div>
      <p className="tab-intro">
        עד כמה האתר מציג את העסק בצורה ברורה ועקבית - כך שגם מנועי חיפוש וגם מערכות AI יוכלו להבין אותו. זו בדיקה של האתר עצמו,
        לא מדידה של הופעה בתשובות של ChatGPT או מערכות דומות.
      </p>
      <div className="summary-bar">
        {(["present", "partial", "missing", "unknown"] as const).map((k) =>
          geo.summary[k] ? (
            <span key={k} className="summary-chip" style={{ cursor: "default" }}>
              <strong>{geo.summary[k]}</strong>{GEO_STATUS[k].text}
            </span>
          ) : null
        )}
      </div>
      <div className="check-list">
        {signals.map((s) => {
          const copy = GEO_COPY[s.key];
          const st = GEO_STATUS[s.status];
          return (
            <article key={s.key} className={`check-card ${st.tone}`}>
              <div className="check-head">
                <h4 className="check-title">{copy?.title || s.key}</h4>
                <StatusPill tone={st.tone}>{st.text}</StatusPill>
              </div>
              <p className="check-text">{copy?.status[s.status] || s.observation}</p>
              {copy?.why && <p className="check-why">{copy.why}</p>}
              <Disclosure label="הצג ראיות">
                <p className="check-evidence">{s.observation}</p>
                {s.evidencePages.length > 0 && (
                  <ul className="plain-list">
                    {s.evidencePages.map((u) => (
                      <li key={u} dir="ltr" className="url-text">{u}</li>
                    ))}
                  </ul>
                )}
                <div className="text-dim detail-note">נמדד בפועל בדפים שנסרקו.</div>
              </Disclosure>
            </article>
          );
        })}
      </div>
      <p className="text-dim footnote">הבדיקה מבוססת על הדפים שנסרקו באתר בניתוח האחרון.</p>
    </div>
  );
}
