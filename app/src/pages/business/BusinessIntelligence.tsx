import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { EmptyState } from "../../components/EmptyState";
import { StatCard } from "../../components/StatCard";
import { Badge, type BadgeTone } from "../../components/review/Badge";
import { listenTopicIntelligence, listenSeoPages, listenLatestIntelligenceRun, listenBaselines } from "../../lib/firestore";
import { runSearchIntelligence, captureBaseline, governedDetails } from "../../lib/functions";
import { DIAGNOSTIC_LABELS, GEO_SIGNAL_LABELS, MISSING_LABELS, TOPIC_STATUS_LABELS } from "../../types";
import type { Baseline, IntelligenceRun, SeoPage, TopicIntelligence, GeoSignal } from "../../types";
import type { BusinessContext } from "./BusinessWorkspace";

// M4 - Search Intelligence & Baseline. What the approved Search Universe is
// worth and where the business stands today, with every number labelled by
// its source and whether it is observed or inferred. No recommendations, no
// tasks (that is M5+). Nothing here calls a function on render: the run and
// the baseline are explicit buttons.

const fmt = (n: number | null | undefined, d = 0) => (n === null || n === undefined ? "—" : Number(n).toLocaleString("he-IL", { maximumFractionDigits: d }));
const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${(n * 100).toFixed(1)}%`);
const when = (ms?: number | null) => (ms ? new Date(ms).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" }) : "—");

const DECISION_LABELS: Record<string, string> = {
  cache_hit: "תוצאה שמורה - לא בוצעה פנייה חדשה ל-Google",
  cache_miss: "פנייה חדשה ל-Search Console (ללא עלות כספית, במסגרת מכסה)",
  forced_refresh: "פנייה חדשה שאישרת",
  blocked_cache_unavailable: "נחסם: בדיקת המטמון נכשלה - לא בוצעה פנייה",
  blocked_safety_check_unavailable: "נחסם: בדיקת בטיחות נכשלה - לא בוצעה פנייה",
  blocked_by_quota: "נחסם: הגעת למכסת הפניות היומית",
  blocked_by_safety_limit: "נחסם: מפסק הגנה פתוח אחרי כשלים"
};

const STATE_TONE: Record<string, BadgeTone> = {
  indexable: "accent", non_indexable: "danger", valid: "accent", present: "accent", crawlable: "accent",
  missing: "warn", absent: "warn", partial: "warn", conflicting: "danger", points_elsewhere: "warn", blocked: "danger", invalid: "danger", unknown: "neutral"
};
const STATE_LABELS: Record<string, string> = {
  indexable: "ניתן לאינדוקס", non_indexable: "לא ניתן לאינדוקס", valid: "תקין", present: "קיים", crawlable: "פתוח לסריקה",
  missing: "חסר", absent: "לא קיים", partial: "חלקי", conflicting: "סותר", points_elsewhere: "מפנה לדף אחר", blocked: "חסום", invalid: "לא תקין", unknown: "לא ידוע"
};
const State = ({ s }: { s: string }) => <Badge tone={STATE_TONE[s] || "neutral"}>{STATE_LABELS[s] || s}</Badge>;
const Observed = () => <Badge tone="info" icon="◉" title="נמדד בפועל ממקור הנתונים">נמדד</Badge>;
const Inferred = ({ rule }: { rule?: string }) => <Badge tone="outline" icon="~" title={rule || "הסקה של המערכת - לא מדידה"}>הסקה</Badge>;

function TopicCard({ t, pagesByKey }: { t: TopicIntelligence; pagesByKey: Map<string, SeoPage> }) {
  const [open, setOpen] = useState(false);
  const g = t.gscCurrent;
  return (
    <article className="record-card confirmed">
      <div className="record-head">
        <div style={{ minWidth: 0, flex: 1 }}>
          <h4 className="record-title" style={{ fontSize: "1rem" }}>{t.title}</h4>
          <div className="record-badges">
            <Badge tone="accent">{TOPIC_STATUS_LABELS[t.ownerStatus]}</Badge>
            <Badge tone="outline" title="ביטחון במקורות: גבוה = נמדד ב-Search Console לפי דף">ביטחון מקורות: {t.sourceConfidence === "high" ? "גבוה" : t.sourceConfidence === "medium" ? "בינוני" : "נמוך"}</Badge>
            {t.business.linkedServices.map((s) => (
              <Badge key={s.name} tone="info" title={s.basis === "observed" ? "שיוך דרך seed משירות מאושר" : "הסקה לפי טקסט השאילתה"}>{s.name}</Badge>
            ))}
          </div>
        </div>
      </div>

      <div className="metric-list" style={{ marginTop: 8 }}>
        <span title="Search Console, שאילתה × דף, התקופה המוצגת"><strong>{g.status === "available" ? fmt(g.impressions) : "—"}</strong>חשיפות (GSC)</span>
        <span><strong>{g.status === "available" ? fmt(g.clicks) : "—"}</strong>קליקים</span>
        <span><strong>{g.status === "available" ? pct(g.ctr) : "—"}</strong>CTR</span>
        <span><strong>{g.status === "available" ? fmt(g.avgPosition, 1) : "—"}</strong>מיקום ממוצע</span>
        <span title="Semrush - ביקוש חיצוני בשוק"><strong>{t.semrush.status === "available" ? fmt(t.semrush.totalMonthlyVolume) : "—"}</strong>נפח חודשי (Semrush)</span>
        <span><strong>{t.queryCount}</strong>שאילתות</span>
      </div>

      <div className="text-dim" style={{ fontSize: "0.82rem", marginTop: 6 }}>
        {g.status === "available" ? (
          <>נראות קיימת ב-Search Console {g.period ? `(${g.period.startDate} – ${g.period.endDate})` : ""} <Observed /></>
        ) : (
          <>Search Console: {g.status === "no_observation" ? "אין חשיפות לשאילתות הנושא בתקופה" : g.reason}</>
        )}
        {" · "}
        Semrush: {t.semrush.status === "available" ? <Observed /> : "אין נתונים (נדחה)"}
        {g.multiplePagesObserved && " · נצפו כמה דפים לאותן שאילתות (תצפית בלבד, לא הכרעה)"}
      </div>

      {open && (
        <div style={{ marginTop: "var(--space-3)" }}>
          <div className="panel-title" style={{ fontSize: "0.9rem" }}>דפים משויכים</div>
          <ul className="evidence-list">
            {t.pages.observed.map((p) => (
              <li key={p.pageKey} className="evidence-item" style={{ padding: "6px 12px" }}>
                <span className="url-text" dir="ltr">{p.url}</span> <Observed /> · {fmt(p.impressions)} חשיפות · מיקום {fmt(p.position, 1)}
                {pagesByKey.get(p.pageKey) ? ` · ${STATE_LABELS[pagesByKey.get(p.pageKey)!.indexability.state]}` : " · לא נסרק"}
              </li>
            ))}
            {t.pages.contentMatched.map((p) => (
              <li key={`c-${p.pageKey}`} className="evidence-item" style={{ padding: "6px 12px" }}>
                <span className="url-text" dir="ltr">{p.url}</span> <Inferred rule={p.rule} /> · כותרת הנושא מופיעה בדף
              </li>
            ))}
            {t.pages.observed.length === 0 && t.pages.contentMatched.length === 0 && <li className="evidence-item">לא נמצא דף משויך.</li>}
          </ul>
          {g.status === "available" && g.queries && (
            <>
              <div className="panel-title" style={{ fontSize: "0.9rem", marginTop: 8 }}>שאילתות ב-Search Console</div>
              <ul className="evidence-list">
                {g.queries.map((q) => (
                  <li key={q.query} className="evidence-item" style={{ padding: "6px 12px" }}>
                    <strong>{q.query}</strong> · {fmt(q.impressions)} חשיפות · {fmt(q.clicks)} קליקים · מיקום {fmt(q.position, 1)}{q.pageCount > 1 ? ` · ${q.pageCount} דפים` : ""}
                  </li>
                ))}
              </ul>
            </>
          )}
          {t.gscDiscovery.status === "available" && (
            <p className="text-dim" style={{ fontSize: "0.82rem" }}>גילוי (90 יום, M3.2): {fmt(t.gscDiscovery.impressions)} חשיפות ב-{t.gscDiscovery.queriesObserved} שאילתות - מקור נפרד מהנתון שלמעלה.</p>
          )}
          {t.missing.length > 0 && (
            <p className="text-dim" style={{ fontSize: "0.82rem" }}>חסר: {t.missing.map((m) => MISSING_LABELS[m] || m).join(" · ")}</p>
          )}
          <p className="text-dim" style={{ fontSize: "0.82rem" }}>שאילתות הנושא: {t.queries.join(", ")}</p>
        </div>
      )}
      <div className="record-foot">
        <span className="text-dim" style={{ fontSize: "0.8rem" }}>חושב {when(t.computedAtMs)}</span>
        <button type="button" className="disclosure" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          פירוט <span className="chev" aria-hidden="true">▾</span>
        </button>
      </div>
    </article>
  );
}

function GeoSignalRow({ s }: { s: GeoSignal }) {
  return (
    <li className="evidence-item" style={{ padding: "8px 12px" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <strong>{GEO_SIGNAL_LABELS[s.key] || s.key}</strong> <State s={s.status} /> <Observed />
      </div>
      <div className="text-dim" style={{ fontSize: "0.82rem", marginTop: 4 }}>{s.observation}</div>
      {s.evidencePages.length > 0 && (
        <div className="text-dim" style={{ fontSize: "0.78rem", marginTop: 2 }} dir="ltr">{s.evidencePages.slice(0, 4).join(" · ")}</div>
      )}
    </li>
  );
}

export default function BusinessIntelligence() {
  const { business } = useOutletContext<BusinessContext>();
  const [topics, setTopics] = useState<TopicIntelligence[] | null>(null);
  const [pages, setPages] = useState<SeoPage[] | null>(null);
  const [run, setRun] = useState<IntelligenceRun | null>(null);
  const [baselines, setBaselines] = useState<Baseline[] | null>(null);
  const [busy, setBusy] = useState<"run" | "baseline" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPages, setShowPages] = useState(false);

  useEffect(() => {
    if (!business) return;
    const unsubs = [
      listenTopicIntelligence(business.id, setTopics),
      listenSeoPages(business.id, setPages),
      listenLatestIntelligenceRun(business.id, setRun),
      listenBaselines(business.id, setBaselines)
    ];
    return () => unsubs.forEach((u) => u());
  }, [business]);

  if (!business) return <div className="loading-row">טוען…</div>;

  async function doRun() {
    setBusy("run");
    setError(null);
    setMessage(null);
    try {
      const r = await runSearchIntelligence(business!.id);
      setMessage(`הניתוח הושלם. Search Console: ${DECISION_LABELS[r.gsc.decision || ""] || r.gsc.reason || r.gsc.status}.`);
    } catch (err) {
      const d = governedDetails(err);
      setError(`${d?.blockedReason ? DECISION_LABELS[d.blockedReason] + ". " : ""}${err instanceof Error ? err.message : "שגיאה"}`);
    } finally {
      setBusy(null);
    }
  }

  async function doBaseline() {
    setBusy("baseline");
    setError(null);
    setMessage(null);
    try {
      const b = await captureBaseline(business!.id);
      setMessage(`נשמר בייסליין גרסה ${b.version}${b.identicalToPrevious ? " (זהה בתוכן לגרסה הקודמת)" : ""}. גרסאות קודמות לא שונו.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשמירת בייסליין");
    } finally {
      setBusy(null);
    }
  }

  const pagesByKey = new Map((pages || []).map((p) => [p.pageKey, p]));
  const currentPages = (pages || []).filter((p) => p.crawlStatus === "fetched");
  const stalePages = (pages || []).filter((p) => p.crawlStatus !== "fetched");
  const s = run?.summary;
  const ctx = run?.businessContext;

  return (
    <div className="section-block">
      <h2 className="section-title" style={{ fontSize: "1.3rem" }}>מודיעין חיפוש ובייסליין</h2>
      <p className="section-intro">
        מה שווה כל נושא מאושר ביקום החיפוש, איפה העסק עומד היום, ומה המצב הטכני של הדפים - כל נתון מסומן אם נמדד בפועל או
        הוסק. אין כאן המלצות או משימות; אלה בשלב הבא.
      </p>

      <div className="panel">
        <div className="panel-row" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="panel-title">ניתוח עדכני</div>
            <div className="panel-meta">
              {run ? `הושלם ${when(run.completedAtMs)}` : "עדיין לא הורץ ניתוח"}
              {run?.gsc && ` · Search Console ${run.gsc.period.startDate} – ${run.gsc.period.endDate}: ${DECISION_LABELS[run.gsc.decision || ""] || run.gsc.reason || run.gsc.status}`}
            </div>
          </div>
          <button type="button" className="btn btn-outline" disabled={busy !== null} onClick={doRun}>
            {busy === "run" ? "מנתח…" : run ? "הרצת ניתוח מחדש" : "הרצת ניתוח"}
          </button>
        </div>
        <p className="panel-meta" style={{ margin: "var(--space-3) 0 0" }}>
          הניתוח סורק את אתר העסק (עד 50 דפים) ומבצע פנייה אחת ל-Search Console דרך מנגנון הבקרה (מטמון ומכסה; ללא עלות
          כספית). אין פנייה ל-Semrush, ל-GA4 או למודל AI.
        </p>
        {error && <div className="login-error" style={{ marginTop: "var(--space-3)", marginBottom: 0 }}>{error}</div>}
        {message && <div className="panel-meta" style={{ marginTop: "var(--space-3)" }}>{message}</div>}
      </div>

      {run && s && (
        <section className="subsection">
          <h3 className="subsection-title">תמונת מצב</h3>
          <div className="stat-grid">
            <StatCard label="נושאים מאושרים" value={s.approvedTopics} />
            <StatCard label="עם נראות ב-Search Console" value={s.topicsWithGscVisibility} />
            <StatCard label="עם דף משויך" value={s.topicsWithAssociatedPage} />
            <StatCard label="דפים שנותחו" value={s.pagesAnalyzed} />
            <StatCard label="ניתנים לאינדוקס (לפי סריקה)" value={`${s.pagesIndexable}/${s.pagesAnalyzed}`} />
            <StatCard label="עם נתונים מובנים" value={`${s.pagesWithStructuredData}/${s.pagesAnalyzed}`} />
          </div>
          <ul className="evidence-list">
            <li className="evidence-item">
              Search Console (כל האתר, סנכרון יומי): {ctx?.searchConsole.status === "available" ? `${fmt(ctx.searchConsole.impressions)} חשיפות · ${fmt(ctx.searchConsole.clicks)} קליקים · עודכן ${when(ctx.searchConsole.retrievedAtMs)}` : ctx?.searchConsole.reason}
            </li>
            <li className="evidence-item">
              GA4: {ctx?.traffic.status === "available" ? `${fmt(ctx.traffic.sessions)} כניסות, מתוכן ${fmt(ctx.traffic.organicSessions)} אורגניות · ${fmt(ctx.traffic.conversions)} המרות · עודכן ${when(ctx.traffic.retrievedAtMs)}` : ctx?.traffic.reason}
            </li>
            <li className="evidence-item">תנועה לפי דף: לא זמין (נדרש דוח GA4 נוסף - נדחה)</li>
            <li className="evidence-item">Semrush: {run.semrush?.reason} · SERP: {run.serpContext?.reason}</li>
            {run.crawl?.report && (
              <li className="evidence-item">
                סריקה: {run.crawl.report.pagesDiscovered} נמצאו · {run.crawl.report.pagesAnalyzed ?? run.crawl.report.pagesFetched} נותחו · {run.crawl.report.failed.length} נכשלו · {run.crawl.report.skipped.length} דולגו
                {run.crawl.robots && ` · robots.txt: ${run.crawl.robots.available ? run.crawl.robots.note || "נקרא" : run.crawl.robots.reason}`}
              </li>
            )}
            {run.gsc?.possiblyTruncated && <li className="evidence-item">Search Console החזיר את מספר השורות המרבי - ייתכן שחלק מהשאילתות חסרות.</li>}
          </ul>
        </section>
      )}

      <section className="subsection">
        <div className="subsection-header">
          <div>
            <h3 className="subsection-title">בייסליין</h3>
            <div className="subsection-sub">צילום מצב שאינו משתנה לעולם. רענון יוצר גרסה חדשה (v1, v2…), והגרסאות הקודמות נשמרות כמות שהן.</div>
          </div>
          <button type="button" className="btn btn-outline" disabled={busy !== null} onClick={doBaseline}>
            {busy === "baseline" ? "שומר…" : `שמירת בייסליין חדש (גרסה ${(baselines?.[0]?.version || 0) + 1})`}
          </button>
        </div>
        {baselines !== null && baselines.length === 0 && <EmptyState title="אין עדיין בייסליין" subtitle="מומלץ להריץ ניתוח קודם ואז לשמור בייסליין." />}
        {baselines && baselines.length > 0 && (
          <div className="data-table-wrap">
            <table className="data-table compact-table">
              <thead>
                <tr><th>גרסה</th><th>נשמר</th><th>נושאים</th><th>דפים</th><th>Search Console לפי דף</th><th>הערה</th></tr>
              </thead>
              <tbody>
                {baselines.map((b) => (
                  <tr key={b.id}>
                    <td>v{b.version}</td>
                    <td className="text-muted">{when(b.capturedAtMs)}</td>
                    <td>{b.topics.length}</td>
                    <td>{b.pages.length}</td>
                    <td className="text-muted">{b.availability.gscQueryPage === "available" && b.period.gscQueryPage ? `${b.period.gscQueryPage.startDate} – ${b.period.gscQueryPage.endDate}` : "לא זמין"}</td>
                    <td className="text-muted">{b.identicalToPrevious ? "זהה לקודם" : b.availability.intelligenceRun === "not_available" ? "ללא ניתוח" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="subsection">
        <h3 className="subsection-title">נושאים מאושרים</h3>
        {topics !== null && topics.length === 0 && <EmptyState title="אין עדיין מודיעין לנושאים" subtitle="אשר/י נושאים בלשונית נושאים והרץ/י ניתוח." />}
        <div className="record-list">
          {(topics || []).map((t) => (
            <TopicCard key={t.id} t={t} pagesByKey={pagesByKey} />
          ))}
        </div>
      </section>

      {run?.geoReadiness && (
        <section className="subsection">
          <h3 className="subsection-title">מוכנות GEO - קריאות העסק למכונה</h3>
          <div className="subsection-sub" style={{ marginBottom: 8 }}>
            האם העובדות החשובות על העסק מפורשות, עקביות וקריאות למכונה באתר עצמו. זו לא מדידה של נראות במנועי AI - את זה
            המערכת עדיין לא בודקת.
          </div>
          <ul className="evidence-list">
            {run.geoReadiness.signals.map((sig) => (
              <GeoSignalRow key={sig.key} s={sig} />
            ))}
          </ul>
        </section>
      )}

      <section className="subsection">
        <button type="button" className="disclosure" aria-expanded={showPages} onClick={() => setShowPages((v) => !v)} style={{ fontSize: "0.95rem" }}>
          דפי האתר ({currentPages.length} נותחו{stalePages.length ? `, ${stalePages.length} לא נסרקו בריצה האחרונה` : ""}) <span className="chev" aria-hidden="true">▾</span>
        </button>
        {showPages && (
          <div className="data-table-wrap" style={{ marginTop: "var(--space-3)" }}>
            <table className="data-table compact-table">
              <thead>
                <tr><th>דף</th><th>תפקיד</th><th>אינדוקס</th><th>קנוני</th><th>מפת אתר</th><th>נתונים מובנים</th><th>קישורים נכנסים</th><th>תצפיות</th></tr>
              </thead>
              <tbody>
                {[...currentPages, ...stalePages].map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className="url-text" dir="ltr">{p.url}</span>
                      <div className="text-dim" style={{ fontSize: "0.78rem" }}>{p.title || "ללא כותרת"}{p.crawlStatus !== "fetched" ? ` · ${p.lastRunReason}` : ""}</div>
                    </td>
                    <td className="text-muted" title={p.role.rule}>{p.role.role}{p.role.basis === "inferred" ? " ~" : ""}</td>
                    <td><State s={p.indexability.state} /></td>
                    <td><State s={p.canonical.state} /></td>
                    <td><State s={p.sitemap.state} /></td>
                    <td><State s={p.structuredData.state} /></td>
                    <td className="text-muted" title={p.links.scope}>{p.links.inboundInternalCount}</td>
                    <td className="text-muted" style={{ fontSize: "0.78rem" }}>{p.diagnostics.map((d) => DIAGNOSTIC_LABELS[d.code] || d.code).join(" · ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-dim" style={{ fontSize: "0.8rem" }}>
              אינדוקס נקבע לפי הסריקה (סטטוס, noindex, קנוני, robots.txt) - סטטוס האינדקס בגוגל עצמו לא נבדק. קישורים נכנסים נספרים
              רק בין הדפים שנסרקו. ~ = הסקה.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
