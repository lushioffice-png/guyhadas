import { Fragment, useMemo, useState } from "react";
import { EmptyState } from "../../../components/EmptyState";
import { StatCard } from "../../../components/StatCard";
import { Pager, usePagination } from "../../../components/ui/Pager";
import { StatusPill } from "../../../components/ui/StatusPill";
import { Disclosure } from "../../../components/ui/Disclosure";
import { FINDING_TEXT, ROLE_LABELS, canonicalState, indexState, needsAttention, pageLabel, pagesCount, presenceState, structuredState, when } from "../../../lib/plainLanguage";
import type { SeoPage } from "../../../types";

const PAGE_SIZE = 15;
type Filter = "all" | "attention" | "not_indexable" | "not_in_sitemap" | "not_crawled";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "הכל" },
  { id: "attention", label: "דורשים תשומת לב" },
  { id: "not_indexable", label: "לא יכולים להיכלל בגוגל" },
  { id: "not_in_sitemap", label: "לא במפת האתר" },
  { id: "not_crawled", label: "לא נבדקו בריצה האחרונה" }
];

function PageDetail({ p }: { p: SeoPage }) {
  const findings = p.diagnostics;
  return (
    <div className="row-detail">
      <div className="detail-note" style={{ marginTop: 0, marginBottom: 8 }}>
        {p.indexability.state === "indexable"
          ? "לפי הסריקה, אין בדף מניעה טכנית להיכלל בגוגל. זה לא אומר ש-Google כבר כלל אותו בפועל."
          : p.indexability.state === "non_indexable"
            ? "לפי הסריקה, יש בדף מניעה טכנית שבגללה הוא לא יכול להיכלל בגוגל."
            : "לא ניתן היה לקבוע מהסריקה אם הדף יכול להיכלל בגוגל."}
      </div>
      <div className="detail-label">מה נמצא בדף</div>
      {findings.length ? (
        <ul className="plain-list">
          {findings.map((d) => (
            <li key={d.code}>
              {FINDING_TEXT[d.code] || d.code}
              {d.basis === "inferred" ? " (הסקת מערכת)" : ""}
            </li>
          ))}
        </ul>
      ) : (
        <div>לא נמצאו בעיות בדף הזה.</div>
      )}
      <div className="detail-grid">
        <div><div className="detail-label">כותרת</div><div>{p.title || "—"}</div></div>
        <div><div className="detail-label">כותרת ראשית בתוכן</div><div>{p.h1.join(" · ") || "—"}</div></div>
        <div><div className="detail-label">תיאור לתוצאות החיפוש</div><div>{p.metaDescription || "—"}</div></div>
        <div><div className="detail-label">כמות מילים</div><div>{p.wordCount ?? "—"}</div></div>
      </div>
      <Disclosure label="פרטים טכניים" tone="technical">
        <ul className="tech-list">
          <li dir="ltr">{p.url}</li>
          <li>HTTP {p.httpStatus ?? "—"} · indexability: {p.indexability.state}{p.indexability.reasons.length ? ` (${p.indexability.reasons.join("; ")})` : ""}{p.indexability.scope ? ` · ${p.indexability.scope}` : ""}</li>
          <li>canonical: {p.canonical.state}{p.canonical.target ? ` → ${p.canonical.target}` : ""}</li>
          <li>robots: {p.robots.state}{p.robots.rule ? ` (${p.robots.rule})` : ""}{p.robots.reason ? ` · ${p.robots.reason}` : ""}</li>
          <li>sitemap: {p.sitemap.state}{p.sitemap.reason ? ` · ${p.sitemap.reason}` : ""}</li>
          <li>structured data: {p.structuredData.state}{p.structuredData.types?.length ? ` (${p.structuredData.types.join(", ")})` : ""}</li>
          <li>links: in {p.links.inboundInternalCount} · out {p.links.outboundInternalCount} · external {p.links.externalCount} · {p.links.scope} · orphan: {p.orphan.state}</li>
          <li>role: {p.role.role} ({p.role.basis}: {p.role.rule})</li>
          <li>diagnostics: {p.diagnostics.map((d) => d.code).join(", ") || "—"}</li>
          <li>crawl: {p.crawlStatus}{p.lastRunReason ? ` · ${p.lastRunReason}` : ""} · {when(p.lastCrawledAtMs)}</li>
        </ul>
      </Disclosure>
    </div>
  );
}

export function TechnicalTab({ pages }: { pages: SeoPage[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const current = pages.filter((p) => p.crawlStatus === "fetched");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pages
      .filter((p) => {
        if (filter === "attention") return p.crawlStatus === "fetched" && needsAttention(p);
        if (filter === "not_indexable") return p.crawlStatus === "fetched" && p.indexability.state === "non_indexable";
        if (filter === "not_in_sitemap") return p.crawlStatus === "fetched" && p.sitemap.state === "absent";
        if (filter === "not_crawled") return p.crawlStatus !== "fetched";
        return true;
      })
      .filter((p) => !q || p.url.toLowerCase().includes(q) || (p.title || "").toLowerCase().includes(q) || pageLabel(p).path.toLowerCase().includes(q))
      .sort((a, b) => Number(needsAttention(b)) - Number(needsAttention(a)) || a.url.localeCompare(b.url));
  }, [pages, filter, query]);
  const pager = usePagination(filtered, PAGE_SIZE, `${filter}|${query}`);

  if (pages.length === 0) return <EmptyState title="עדיין לא נבדקו דפים" subtitle="הרץ/י ניתוח כדי לבדוק את דפי האתר." />;

  const count = (fn: (p: SeoPage) => boolean) => current.filter(fn).length;
  return (
    <div>
      <p className="tab-intro">הבדיקה הטכנית של דפי האתר: האם לפי הסריקה אין מניעה טכנית שהדפים ייכללו בגוגל, האם הם מוגדרים נכון, ואיך הם מקושרים זה לזה. זו לא בדיקה של אילו דפים Google כבר כלל בפועל.</p>
      <div className="stat-grid">
        <StatCard label="דפים שנבדקו" value={current.length} />
        <StatCard label="יכולים להיכלל בגוגל (לפי הסריקה)" value={`${count((p) => p.indexability.state === "indexable")}/${current.length}`} />
        <StatCard label="דורשים תשומת לב" value={count(needsAttention)} />
        <StatCard label="עם מידע למנועי חיפוש" value={`${count((p) => p.structuredData.state === "present")}/${current.length}`} />
      </div>

      <div className="table-toolbar">
        <div className="filter-chips" role="group" aria-label="סינון דפים">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className={`summary-chip ${filter === f.id ? "active" : ""}`} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <input className="select-quiet search-input" placeholder="חיפוש דף…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="חיפוש דף" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="אין דפים שמתאימים לסינון" subtitle="נסה/י סינון אחר." />
      ) : (
        <div className="data-table-wrap table-sticky">
          <table className="data-table">
            <thead>
              <tr>
                <th>דף</th>
                <th>סוג</th>
                <th title="לפי הסריקה שלנו: האם אין בדף מניעה טכנית (כמו הוראה שמבקשת ממנועי חיפוש לא לכלול את הדף) שתמנע מ-Google לכלול אותו. לא נבדק אם Google כבר כלל את הדף בפועל.">יכול להיכלל בגוגל</th>
                <th title="כתובת הדף הראשית ש-Google אמור להכיר בה">כתובת ראשית</th>
                <th>במפת האתר</th>
                <th title="מידע שעוזר למנועי חיפוש להבין את הדף">מידע למנועי חיפוש</th>
                <th title="כמה דפים אחרים באתר (מתוך שנבדקו) מקשרים לדף">מקושר מ-</th>
                <th><span className="visually-hidden">פירוט</span></th>
              </tr>
            </thead>
            <tbody>
              {pager.rows.map((p) => {
                const label = pageLabel(p);
                const stale = p.crawlStatus !== "fetched";
                const open = openId === p.id;
                const idx = indexState(p.indexability.state);
                const can = canonicalState(p.canonical.state);
                const sm = presenceState(p.sitemap.state);
                const sd = structuredState(p.structuredData.state);
                return (
                  <Fragment key={p.id}>
                    <tr className={`${open ? "row-open" : ""} ${stale ? "row-stale" : ""}`}>
                      <td className="cell-page">
                        <div className="cell-primary">{label.primary}</div>
                        <div className="cell-secondary" dir="auto">{label.path}</div>
                        {stale && <div className="cell-secondary">לא נבדק בריצה האחרונה</div>}
                        {!stale && needsAttention(p) && <StatusPill tone="warn">דורש תשומת לב</StatusPill>}
                      </td>
                      <td className="text-muted">{ROLE_LABELS[p.role.role] || "אחר"}</td>
                      <td><StatusPill tone={idx.tone}>{idx.text}</StatusPill></td>
                      <td><StatusPill tone={can.tone}>{can.text}</StatusPill></td>
                      <td><StatusPill tone={sm.tone}>{sm.text}</StatusPill></td>
                      <td><StatusPill tone={sd.tone}>{sd.text}</StatusPill></td>
                      <td className="text-muted">{p.links.inboundInternalCount === 0 ? "אף דף" : pagesCount(p.links.inboundInternalCount)}</td>
                      <td style={{ textAlign: "end" }}>
                        <button type="button" className="disclosure" aria-expanded={open} onClick={() => setOpenId(open ? null : p.id)}>
                          פירוט <span className="chev" aria-hidden="true">▾</span>
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr className="detail-row">
                        <td colSpan={8}><PageDetail p={p} /></td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pager {...pager} />
      <p className="text-dim footnote">
        הבדיקה מבוססת על סריקת האתר (עד 50 דפים). ״יכול להיכלל בגוגל״ מתאר רק אם אין מניעה טכנית לפי הסריקה - לא בדקנו אם Google כבר כלל את הדף בפועל. קישורים נספרים רק בין הדפים שנבדקו.
      </p>
    </div>
  );
}
