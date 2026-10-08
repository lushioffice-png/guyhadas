import { Fragment, useState } from "react";
import { EmptyState } from "../../../components/EmptyState";
import { Pager, usePagination } from "../../../components/ui/Pager";
import { StatusPill } from "../../../components/ui/StatusPill";
import { Disclosure } from "../../../components/ui/Disclosure";
import { MISSING_TEXT, fmt, pct, topicPage, topicVisibility, when } from "../../../lib/plainLanguage";
import type { TopicIntelligence } from "../../../types";

const PAGE_SIZE = 15;

function TopicDetail({ t }: { t: TopicIntelligence }) {
  const g = t.gscCurrent;
  return (
    <div className="row-detail">
      <div className="detail-grid">
        <div>
          <div className="detail-label">דפים שמופיעים בגוגל לנושא</div>
          {t.pages.observed.length ? (
            <ul className="plain-list">
              {t.pages.observed.map((p) => (
                <li key={p.pageKey}>
                  <span className="url-text" dir="ltr">{p.url}</span> · {fmt(p.impressions)} חשיפות · מיקום {fmt(p.position, 1)}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-dim">אין</div>
          )}
          {t.pages.observed.length > 1 && <div className="text-dim detail-note">כמה דפים מופיעים לאותו נושא - זו תצפית, לא קביעה.</div>}
        </div>
        <div>
          <div className="detail-label">דפים שקשורים לנושא לפי התוכן (הסקת מערכת)</div>
          {t.pages.contentMatched.length ? (
            <ul className="plain-list">
              {t.pages.contentMatched.map((p) => (
                <li key={p.pageKey}><span className="url-text" dir="ltr">{p.url}</span></li>
              ))}
            </ul>
          ) : (
            <div className="text-dim">אין</div>
          )}
        </div>
        <div>
          <div className="detail-label">ביקוש בשוק</div>
          <div>{t.semrush.status === "available" ? `${fmt(t.semrush.totalMonthlyVolume)} חיפושים בחודש (סכום השאילתות)` : "אין עדיין נתוני ביקוש"}</div>
        </div>
        <div>
          <div className="detail-label">שירותים ואזורים</div>
          <div>{[...t.business.linkedServices.map((s) => s.name), ...t.business.geography.map((g2) => g2.value)].join(" · ") || "—"}</div>
        </div>
      </div>

      {g.status === "available" && g.queries && g.queries.length > 0 && (
        <Disclosure label={`שאילתות בגוגל (${g.queries.length})`}>
          <table className="data-table compact-table">
            <thead><tr><th>שאילתה</th><th>חשיפות</th><th>קליקים</th><th>מיקום ממוצע</th></tr></thead>
            <tbody>
              {g.queries.map((q) => (
                <tr key={q.query}><td>{q.query}</td><td>{fmt(q.impressions)}</td><td>{fmt(q.clicks)}</td><td>{fmt(q.position, 1)}</td></tr>
              ))}
            </tbody>
          </table>
        </Disclosure>
      )}

      <Disclosure label="פרטים טכניים" tone="technical">
        <ul className="tech-list">
          <li>כל שאילתות הנושא ({t.queryCount}): {t.queries.join(", ")}</li>
          <li>Search Console שאילתה×דף: {g.status}{g.period ? ` · ${g.period.startDate} – ${g.period.endDate}` : ""}{g.reason ? ` · ${g.reason}` : ""}{g.note ? ` · ${g.note}` : ""}</li>
          {g.rankingDistribution && <li>פיזור מיקומים: {Object.entries(g.rankingDistribution).map(([k, v]) => `${k}: ${v}`).join(" · ")}</li>}
          <li>גילוי 90 יום (M3.2): {t.gscDiscovery.status === "available" ? `${fmt(t.gscDiscovery.impressions)} חשיפות · ${t.gscDiscovery.queriesObserved} שאילתות` : t.gscDiscovery.reason}</li>
          <li>Semrush: {t.semrush.status}{t.semrush.reason ? ` · ${t.semrush.reason}` : ""}{t.semrush.maxDifficulty != null ? ` · קושי מרבי ${t.semrush.maxDifficulty}` : ""}</li>
          <li>מקורות: {Object.entries(t.sourceMix).map(([k, v]) => `${k}=${v}`).join(", ") || "—"} · ביטחון מקורות: {t.sourceConfidence}</li>
          <li>חסר: {t.missing.map((m) => MISSING_TEXT[m] || m).join(" · ") || "—"}</li>
          <li>שאילתות חדשות ב-30 יום: {t.emergence.newQueriesLast30Days ?? "לא ידוע"} · כוונה ראשונית: {t.business.preliminaryIntent || "—"}</li>
          <li>חושב: {when(t.computedAtMs)} · topicId={t.topicId}</li>
        </ul>
      </Disclosure>
    </div>
  );
}

export function TopicsTab({ topics }: { topics: TopicIntelligence[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const pager = usePagination(topics, PAGE_SIZE);
  if (topics.length === 0) return <EmptyState title="אין עדיין נתונים לנושאים" subtitle="אשר/י נושאים בלשונית נושאי חיפוש והרץ/י ניתוח." />;

  return (
    <div>
      <p className="tab-intro">כל נושא שאישרת: האם הוא מופיע בגוגל, כמה חשיפות וקליקים קיבל, ובאיזה מיקום ממוצע.</p>
      <div className="data-table-wrap table-sticky">
        <table className="data-table">
          <thead>
            <tr>
              <th>נושא</th>
              <th>בגוגל</th>
              <th>חשיפות</th>
              <th>קליקים</th>
              <th title="שיעור הקלקה">CTR</th>
              <th>מיקום ממוצע</th>
              <th>דף באתר</th>
              <th><span className="visually-hidden">פירוט</span></th>
            </tr>
          </thead>
          <tbody>
            {pager.rows.map((t) => {
              const v = topicVisibility(t);
              const p = topicPage(t);
              const g = t.gscCurrent;
              const has = g.status === "available";
              const open = openId === t.id;
              return (
                <Fragment key={t.id}>
                  <tr className={open ? "row-open" : ""}>
                    <td><strong>{t.title}</strong></td>
                    <td><StatusPill tone={v.tone}>{v.text}</StatusPill></td>
                    <td>{has ? fmt(g.impressions) : "—"}</td>
                    <td>{has ? fmt(g.clicks) : "—"}</td>
                    <td>{has ? pct(g.ctr) : "—"}</td>
                    <td>{has ? fmt(g.avgPosition, 1) : "—"}</td>
                    <td><StatusPill tone={p.tone}>{p.text}</StatusPill></td>
                    <td style={{ textAlign: "end" }}>
                      <button type="button" className="disclosure" aria-expanded={open} onClick={() => setOpenId(open ? null : t.id)}>
                        פירוט <span className="chev" aria-hidden="true">▾</span>
                      </button>
                    </td>
                  </tr>
                  {open && (
                    <tr className="detail-row">
                      <td colSpan={8}><TopicDetail t={t} /></td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pager {...pager} />
      <p className="text-dim footnote">נתוני גוגל מ-Search Console ל-28 יום שמסתיימים לפני 3 ימים.</p>
    </div>
  );
}
