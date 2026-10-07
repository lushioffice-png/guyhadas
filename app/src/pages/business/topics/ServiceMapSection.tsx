import { useEffect, useState, type FormEvent } from "react";
import { analyzeBusiness } from "../../../lib/functions";
import type { AnalyzeBusinessResult } from "../../../lib/functions";
import { createManualService, listenLatestAnalysisRun } from "../../../lib/firestore";
import type { Business, BusinessAnalysisRun, BusinessService, CrawlReport, ServiceOwnerStatus, TaskPriority } from "../../../types";
import { EmptyState } from "../../../components/EmptyState";
import { ProvenanceBadge } from "../../../components/review/provenance";
import { ServiceCard } from "./ServiceCard";

type Filter = "all" | ServiceOwnerStatus;

const STATUS_ORDER: Record<ServiceOwnerStatus, number> = { needs_review: 0, confirmed: 1, rejected: 2 };
const PRIORITY_ORDER: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

const BLOCKED_LABELS: Record<string, string> = {
  blocked_by_budget: "חסימת תקציב",
  blocked_by_quota: "חסימת מכסה",
  blocked_by_safety_limit: "חסימת מעגל בטיחות (כשלים חוזרים)"
};

function formatDateTime(value: unknown): string | null {
  const ts = value as { toDate?: () => Date } | null | undefined;
  if (!ts?.toDate) return null;
  return ts.toDate().toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });
}

// What the crawl actually did - only fields the backend really reports.
function CrawlDetails({ crawl }: { crawl: CrawlReport }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: "var(--space-3)" }}>
      <div className="metric-list" style={{ marginTop: 0 }}>
        <span><strong>{crawl.pagesDiscovered}</strong>עמודים התגלו</span>
        <span><strong>{crawl.pagesFetched}</strong>נטענו</span>
        <span><strong>{crawl.pagesParsed}</strong>נותחו בהצלחה</span>
        <span><strong>{crawl.failedCount}</strong>נכשלו</span>
        <span><strong>{crawl.skippedCount}</strong>דולגו</span>
      </div>
      <button type="button" className="disclosure" aria-expanded={open} onClick={() => setOpen((v) => !v)} style={{ marginTop: "var(--space-2)" }}>
        פירוט הסריקה <span className="chev" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div style={{ marginTop: "var(--space-2)", fontSize: "0.85rem" }}>
          <div className="text-dim" style={{ marginBottom: 6 }}>
            {crawl.siteHost && <>אתר: <span className="url-text">{crawl.siteHost}</span> · </>}
            {crawl.sitemap && <>מפת אתר: <span className="url-text">{crawl.sitemap}</span> · </>}
            התגלו דרך קישורים בעמוד הבית: {crawl.discoveredVia.homepageLinks} · דרך מפת האתר: {crawl.discoveredVia.sitemap}
          </div>
          <div className="text-muted" style={{ fontWeight: 700, marginTop: 8 }}>עמודים שנותחו ({crawl.parsedUrls.length})</div>
          <ul style={{ margin: "4px 0 0", paddingInlineStart: 18 }}>
            {crawl.parsedUrls.map((u) => (
              <li key={u}><a className="url-text" href={u} target="_blank" rel="noreferrer">{u}</a></li>
            ))}
          </ul>
          {crawl.failed.length > 0 && (
            <>
              <div className="text-muted" style={{ fontWeight: 700, marginTop: 8 }}>נכשלו</div>
              <ul style={{ margin: "4px 0 0", paddingInlineStart: 18 }}>
                {crawl.failed.map((f) => (
                  <li key={f.url}><span className="url-text">{f.url}</span> <span className="text-dim">— {f.reason}</span></li>
                ))}
              </ul>
            </>
          )}
          {crawl.skipped.length > 0 && (
            <>
              <div className="text-muted" style={{ fontWeight: 700, marginTop: 8 }}>
                דולגו {crawl.skippedCount > crawl.skipped.length ? `(מוצגים ${crawl.skipped.length} מתוך ${crawl.skippedCount})` : ""}
              </div>
              <ul style={{ margin: "4px 0 0", paddingInlineStart: 18 }}>
                {crawl.skipped.map((s) => (
                  <li key={s.url}><span className="url-text">{s.url}</span> <span className="text-dim">— {s.reason}</span></li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Last recorded analysis run (persisted), so the state survives a reload.
function WebsiteAnalysisPanel({ run, business }: { run: BusinessAnalysisRun | null | undefined; business: Business }) {
  if (run === undefined) return null;
  if (!business.website) {
    return (
      <div className="panel tone-warn">
        <div className="panel-title">ניתוח האתר</div>
        <div className="panel-meta">לעסק לא מוגדר אתר בפרופיל, ולכן אין מה לסרוק.</div>
      </div>
    );
  }
  if (run === null) {
    return (
      <div className="panel">
        <div className="panel-title">ניתוח האתר</div>
        <div className="panel-meta">עדיין לא נשמר ניתוח. נתוני הסריקה יופיעו כאן אחרי הניתוח הבא.</div>
      </div>
    );
  }
  const when = formatDateTime(run.completedAt);
  return (
    <div className="panel">
      <div className="panel-row" style={{ justifyContent: "space-between" }}>
        <div className="panel-title">ניתוח האתר</div>
        <div className="panel-meta">{when ? `ניתוח אחרון: ${when}` : "ניתוח אחרון"}</div>
      </div>
      {run.crawl ? <CrawlDetails crawl={run.crawl} /> : <div className="panel-meta">לא נשמרו נתוני סריקה לריצה הזו.</div>}
    </div>
  );
}

// Result of the run just made in this session - only backend-reported values.
function AnalysisResult({ result }: { result: AnalyzeBusinessResult }) {
  const failed = result.aiAvailable && result.aiError && !result.aiBlockedReason;
  const blocked = result.aiAvailable && result.aiBlockedReason;
  return (
    <div className={`panel ${failed ? "tone-danger" : blocked ? "tone-warn" : "tone-accent"}`}>
      <div className="panel-title">{failed ? "הניתוח הושלם חלקית" : "הניתוח הושלם"}</div>
      <div className="metric-list">
        {result.crawl && <span><strong>{result.crawl.pagesParsed}</strong>עמודים נותחו</span>}
        {result.aiAvailable && <span><strong>{result.aiServicesProposed}</strong>פריטים חדשים לבדיקה</span>}
        {result.aiAvailable && <span><strong>{result.aiServicesMerged}</strong>פריטים קיימים עודכנו</span>}
        <span><strong>{result.ownerServicesSeeded}</strong>נוספו מהקמת העסק</span>
      </div>
      <div className="panel-meta" style={{ marginTop: "var(--space-2)" }}>
        {!result.aiAvailable && "ניתוח AI אינו מוגדר - נקלטו רק שירותים שהוזנו בהקמת העסק."}
        {result.aiAvailable && result.aiCacheHit && "התוכן לא השתנה מאז הניתוח הקודם - נעשה שימוש בתוצאה השמורה, ללא פנייה חדשה ל-AI ובלי עלות."}
        {result.aiAvailable && !result.aiCacheHit && result.aiCostUsd != null && `עלות פניית ה-AI: $${result.aiCostUsd.toFixed(4)}`}
      </div>
      {blocked && (
        <div className="panel-meta" style={{ marginTop: "var(--space-2)", color: "var(--color-warn)" }}>
          ניתוח ה-AI נחסם ע״י בקרת העלויות ({BLOCKED_LABELS[result.aiBlockedReason!] || result.aiBlockedReason}): {result.aiError}
        </div>
      )}
      {failed && (
        <div className="panel-meta" style={{ marginTop: "var(--space-2)", color: "var(--color-danger)" }}>
          ניתוח ה-AI נכשל: {result.aiError}
        </div>
      )}
    </div>
  );
}

export function ServiceMapSection({ business, services }: { business: Business; services: BusinessService[] | null }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeBusinessResult | null>(null);
  // Cost-control rule: a cached result is reused by default; this is the
  // explicit "ignore the cache" option (budget/quota limits still apply).
  const [forceRefresh, setForceRefresh] = useState(false);
  const [latestRun, setLatestRun] = useState<BusinessAnalysisRun | null | undefined>(undefined);

  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => listenLatestAnalysisRun(business.id, setLatestRun), [business.id]);

  async function handleAnalyze() {
    setAnalyzing(true);
    setAnalyzeError(null);
    setAnalyzeResult(null);
    try {
      setAnalyzeResult(await analyzeBusiness(business.id, forceRefresh));
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : "שגיאה בניתוח העסק");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    try {
      await createManualService(business.id, newName.trim(), newDescription.trim() || undefined);
      setNewName("");
      setNewDescription("");
    } finally {
      setAdding(false);
    }
  }

  const all = services || [];
  const counts = {
    all: all.length,
    needs_review: all.filter((s) => s.ownerStatus === "needs_review").length,
    confirmed: all.filter((s) => s.ownerStatus === "confirmed").length,
    rejected: all.filter((s) => s.ownerStatus === "rejected").length
  };
  const visible = all
    .filter((s) => filter === "all" || s.ownerStatus === filter)
    .sort(
      (a, b) =>
        STATUS_ORDER[a.ownerStatus] - STATUS_ORDER[b.ownerStatus] ||
        PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    );

  const filterChips: { key: Filter; label: string }[] = [
    { key: "all", label: "הכל" },
    { key: "needs_review", label: "ממתינים לבדיקה" },
    { key: "confirmed", label: "מאושרים" },
    { key: "rejected", label: "נדחו" }
  ];

  return (
    <section>
      <div className="subsection-header">
        <div>
          <h3 className="subsection-title">מפת שירותים</h3>
          <div className="subsection-sub">מה העסק מוכר - כפי שהמערכת הבינה מהקמת העסק ומתוכן האתר. אשר/י את מה שנכון לפני שממשיכים לגילוי חיפוש.</div>
        </div>
        <div className="panel-row">
          <label className="check-label">
            <input type="checkbox" checked={forceRefresh} onChange={(e) => setForceRefresh(e.target.checked)} />
            התעלם מתוצאה שמורה
          </label>
          <button type="button" className="btn btn-primary" disabled={analyzing} onClick={handleAnalyze}>
            {analyzing ? "מנתח…" : "נתח את העסק והאתר"}
          </button>
        </div>
      </div>

      {analyzing && (
        <div className="panel">
          <div className="panel-row">
            <span className="spinner" aria-hidden="true" />
            <span className="panel-title">מנתח את העסק והאתר…</span>
          </div>
          <div className="panel-meta" style={{ marginTop: 6 }}>
            סורק את עמודי האתר ומנתח אותם. זה עשוי להימשך עד כמה דקות; ההתקדמות לא מדווחת בזמן אמת.
          </div>
        </div>
      )}
      {analyzeError && <div className="login-error">{analyzeError}</div>}
      {analyzeResult && !analyzing && <AnalysisResult result={analyzeResult} />}

      <WebsiteAnalysisPanel run={latestRun} business={business} />

      {all.length > 0 && (
        <div className="summary-bar" role="tablist" aria-label="סינון לפי סטטוס">
          {filterChips.map((c) => (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={filter === c.key}
              className={`summary-chip ${filter === c.key ? "active" : ""}`}
              onClick={() => setFilter(c.key)}
            >
              <strong>{counts[c.key]}</strong>
              {c.label}
            </button>
          ))}
        </div>
      )}

      {all.length > 0 && (
        <div className="legend" aria-label="מקרא מקורות">
          <span>מקור כל ערך:</span>
          <ProvenanceBadge provenance="owner" />
          <ProvenanceBadge provenance="website" />
          <ProvenanceBadge provenance="ai_inference" />
          <span>— ריחוף מעל ערך מציג הסבר ואת עמוד המקור.</span>
        </div>
      )}

      {services === null && <div className="loading-row">טוען…</div>}
      {services !== null && all.length === 0 && (
        <EmptyState title="אין עדיין מפת שירותים" subtitle="לחץ/י 'נתח את העסק והאתר', או הוסף/י שירות ידנית מטה." />
      )}
      {services !== null && all.length > 0 && visible.length === 0 && (
        <EmptyState title="אין פריטים בסינון הזה" />
      )}

      <div className="record-list">
        {visible.map((s) => (
          <ServiceCard key={s.id} service={s} />
        ))}
      </div>

      <form onSubmit={handleAdd} className="panel add-form" style={{ marginTop: "var(--space-4)" }}>
        <div className="form-field">
          <label htmlFor="service-name">הוספת שירות ידנית</label>
          <input id="service-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="שם השירות" />
        </div>
        <div className="form-field">
          <label htmlFor="service-desc">תיאור (אופציונלי)</label>
          <input id="service-desc" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-outline" disabled={adding || !newName.trim()}>
          {adding ? "מוסיף…" : "+ הוספה"}
        </button>
      </form>
    </section>
  );
}
