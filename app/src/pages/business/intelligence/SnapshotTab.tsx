import { StatCard } from "../../../components/StatCard";
import { Disclosure } from "../../../components/ui/Disclosure";
import { StatusPill } from "../../../components/ui/StatusPill";
import { DECISION_TEXT, GEO_COPY, fmt, needsReview, pagesCount, when } from "../../../lib/plainLanguage";
import type { IntelligenceRun, SeoPage, TopicIntelligence } from "../../../types";

// תמונת מצב - what was inspected, what was found, what matters now.
// Findings are stated, never turned into recommendations (that is M5).
export function SnapshotTab({ run, topics, pages, onOpen }: { run: IntelligenceRun; topics: TopicIntelligence[]; pages: SeoPage[]; onOpen: (tab: string) => void }) {
  const s = run.summary!;
  const current = pages.filter((p) => p.crawlStatus === "fetched");
  const attention = current.filter(needsReview);
  const visible = topics.filter((t) => t.gscCurrent.status === "available" && (t.gscCurrent.impressions || 0) > 0);
  const notVisible = topics.length - visible.length;
  const nonIndexable = current.filter((p) => p.indexability.state === "non_indexable").length;
  const geoGaps = (run.geoReadiness?.signals || []).filter((g) => g.status === "missing" || g.status === "partial");
  const ctx = run.businessContext;

  const findings: { tone: "good" | "warn" | "bad"; text: string; tab: string }[] = [];
  if (s.approvedTopics === 0) findings.push({ tone: "warn", text: "אין עדיין נושאי חיפוש מאושרים - אשר/י נושאים בלשונית נושאי חיפוש כדי שהמערכת תוכל לנתח אותם.", tab: "topics" });
  else if (notVisible > 0) findings.push({ tone: "warn", text: notVisible === 1 ? `נושא אחד מתוך ${topics.length} שאישרת עדיין לא מופיע בגוגל.` : `${notVisible} מתוך ${topics.length} הנושאים שאישרת עדיין לא מופיעים בגוגל.`, tab: "topics" });
  else findings.push({ tone: "good", text: `כל ${topics.length} הנושאים שאישרת כבר מופיעים בגוגל.`, tab: "topics" });
  if (nonIndexable > 0) findings.push({ tone: "bad", text: nonIndexable === 1 ? "לפי הסריקה, דף אחד באתר לא יכול להיכלל בגוגל." : `לפי הסריקה, ${nonIndexable} דפים באתר לא יכולים להיכלל בגוגל.`, tab: "technical" });
  if (attention.length > 0) findings.push({ tone: "warn", text: attention.length === 1 ? "דף אחד דורש תשומת לב טכנית." : `${pagesCount(attention.length)} דורשים תשומת לב טכנית.`, tab: "technical" });
  else if (current.length) findings.push({ tone: "good", text: "לא נמצאו בעיות טכניות משמעותיות בדפים שנבדקו.", tab: "technical" });
  if (geoGaps.length) findings.push({ tone: "warn", text: `${geoGaps.length} מתוך ${run.geoReadiness!.signals.length} הבדיקות של בהירות העסק באתר דורשות שיפור (למשל: ${GEO_COPY[geoGaps[0].key]?.title || geoGaps[0].key}).`, tab: "geo" });

  return (
    <div>
      <div className="stat-grid">
        <StatCard label="נושאים מאושרים" value={s.approvedTopics} />
        <StatCard label="מופיעים בגוגל" value={`${visible.length}/${topics.length}`} />
        <StatCard label="דפים שנבדקו" value={current.length} />
        <StatCard label="דפים שדורשים תשומת לב" value={attention.length} />
      </div>

      <h3 className="block-title">מה חשוב לדעת עכשיו</h3>
      <ul className="finding-list">
        {findings.map((f, i) => (
          <li key={i} className="finding">
            <StatusPill tone={f.tone}>{f.tone === "good" ? "תקין" : f.tone === "bad" ? "חשוב" : "לתשומת לב"}</StatusPill>
            <span className="finding-text">{f.text}</span>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => onOpen(f.tab)}>לפרטים</button>
          </li>
        ))}
      </ul>

      <h3 className="block-title">האתר בגוגל ובאנליטיקס</h3>
      <div className="kv-list">
        <div className="kv">
          <span className="kv-label">חשיפות בגוגל (28 יום)</span>
          <span className="kv-value">{ctx?.searchConsole.status === "available" ? fmt(ctx.searchConsole.impressions) : "אין נתונים"}</span>
        </div>
        <div className="kv">
          <span className="kv-label">קליקים מגוגל (28 יום)</span>
          <span className="kv-value">{ctx?.searchConsole.status === "available" ? fmt(ctx.searchConsole.clicks) : "אין נתונים"}</span>
        </div>
        <div className="kv">
          <span className="kv-label">כניסות לאתר / מתוכן מחיפוש אורגני</span>
          <span className="kv-value">{ctx?.traffic.status === "available" ? `${fmt(ctx.traffic.sessions)} / ${fmt(ctx.traffic.organicSessions)}` : "אין נתונים"}</span>
        </div>
        <div className="kv">
          <span className="kv-label">המרות (28 יום)</span>
          <span className="kv-value">{ctx?.traffic.status === "available" ? fmt(ctx.traffic.conversions) : "אין נתונים"}</span>
        </div>
      </div>

      <Disclosure label="פרטים טכניים" tone="technical">
        <ul className="tech-list">
          <li>ריצה: {run.id} · התחלה {when(run.startedAtMs)} · סיום {when(run.completedAtMs)}</li>
          {run.gsc && (
            <li>
              Search Console (שאילתה × דף), {run.gsc.period.startDate} – {run.gsc.period.endDate}: {run.gsc.status} · {DECISION_TEXT[run.gsc.decision || ""] || run.gsc.decision || "—"} · providerCalled={String(run.gsc.providerCalled)} · {run.gsc.rowsReturned} שורות{run.gsc.possiblyTruncated ? " · ייתכן שנחתך (מגבלת שורות)" : ""}{run.gsc.reason ? ` · ${run.gsc.reason}` : ""}
            </li>
          )}
          {run.crawl?.report && (
            <li>
              סריקה: {run.crawl.report.pagesDiscovered} נמצאו · {run.crawl.report.pagesAnalyzed ?? run.crawl.report.pagesFetched} נותחו · {run.crawl.report.failed.length} נכשלו · {run.crawl.report.skipped.length} דולגו · מפת אתר: {run.crawl.report.sitemap || "—"}
            </li>
          )}
          {run.crawl?.robots && <li>robots.txt: {run.crawl.robots.available ? run.crawl.robots.note || "נקרא" : run.crawl.robots.reason}</li>}
          <li>Search Console יומי: {ctx?.searchConsole.status === "available" ? `עודכן ${when(ctx.searchConsole.retrievedAtMs)}` : ctx?.searchConsole.reason}</li>
          <li>GA4 יומי: {ctx?.traffic.status === "available" ? `עודכן ${when(ctx.traffic.retrievedAtMs)}` : ctx?.traffic.reason}</li>
          <li>תנועה לפי דף: {ctx?.pageLevelTraffic.reason}</li>
          <li>Semrush: {run.semrush?.reason}</li>
          <li>SERP: {run.serpContext?.reason}</li>
          {run.crawl?.report && run.crawl.report.failed.length > 0 && (
            <li>
              נכשלו: {run.crawl.report.failed.map((f) => `${f.url} (${f.reason})`).join(" · ")}
            </li>
          )}
        </ul>
      </Disclosure>
    </div>
  );
}
