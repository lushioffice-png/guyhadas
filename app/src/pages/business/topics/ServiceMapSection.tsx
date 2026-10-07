import { useEffect, useReducer, useState, type FormEvent } from "react";
import { analyzeBusiness, analyzeBusinessNewPaidRun } from "../../../lib/functions";
import type { AnalyzeBusinessResult } from "../../../lib/functions";
import { createManualService, listenLatestAnalysisRun } from "../../../lib/firestore";
import type { Business, BusinessAnalysisRun, BusinessService, CrawlReport, ServiceOwnerStatus, TaskPriority } from "../../../types";
import { EmptyState } from "../../../components/EmptyState";
import { ProvenanceBadge } from "../../../components/review/provenance";
import { ServiceCard } from "./ServiceCard";
import { ConfirmPaidRunDialog } from "../../../components/review/ConfirmPaidRunDialog";
import { initialPaidRunState, paidRunReducer, runIsForced } from "../../../lib/paidRunFlow";
import type { CostControlDecision } from "../../../types";

type Filter = "all" | ServiceOwnerStatus;

const STATUS_ORDER: Record<ServiceOwnerStatus, number> = { needs_review: 0, confirmed: 1, rejected: 2 };
const PRIORITY_ORDER: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

const AI_ESTIMATE_NOTE = "עלות משוערת לניתוח חדש: כ-$0.09–$0.15.";

// One line saying what the cost-control layer did on a run.
function CostDecisionLine({ cc }: { cc: CostControlDecision }) {
  const hash = cc.inputHash ? cc.inputHash.slice(0, 10) + "…" : "—";
  let text: string;
  switch (cc.cacheDecision) {
    case "cache_hit":
      text = "נעשה שימוש בתוצאה קיימת — Claude לא נקרא · עלות $0";
      break;
    case "cache_miss":
      text = `לא נמצאה תוצאה לאותו קלט — Claude נקרא${cc.costUsd != null ? ` · עלות $${cc.costUsd.toFixed(4)}` : ""}`;
      break;
    case "forced_refresh":
      text = `ניתוח חדש לבקשתך — Claude נקרא${cc.costUsd != null ? ` · עלות $${cc.costUsd.toFixed(4)}` : ""}`;
      break;
    case "blocked_cache_unavailable":
    case "blocked_safety_check_unavailable":
      text = "בקרת העלויות לא הצליחה לרוץ — Claude לא נקרא · עלות $0";
      break;
    case "blocked_by_budget":
    case "blocked_by_quota":
    case "blocked_by_safety_limit":
      text = "נחסם ע״י מגבלת עלות/מכסה — Claude לא נקרא · עלות $0";
      break;
    default:
      text = cc.providerCalled ? "Claude נקרא" : "לא בוצעה פנייה ל-AI";
  }
  return (
    <div className="panel-meta" style={{ marginTop: "var(--space-2)" }}>
      {text}
      <span className="text-dim"> · מודל {cc.model ?? "—"} · גרסת הנחיה {cc.promptVersion} · מזהה קלט </span>
      <span className="url-text" title={cc.inputHash ?? undefined}>{hash}</span>
    </div>
  );
}

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
      {run.costControl && <CostDecisionLine cc={run.costControl} />}
      {run.crawl ? <CrawlDetails crawl={run.crawl} /> : <div className="panel-meta">לא נשמרו נתוני סריקה לריצה הזו.</div>}
    </div>
  );
}

// Result of the run just made in this session - only backend-reported values.
function AnalysisResult({ result }: { result: AnalyzeBusinessResult }) {
  const infra = !!result.aiBlockedReason && /_unavailable$/.test(result.aiBlockedReason);
  const failed = result.aiAvailable && result.aiError && !result.aiBlockedReason;
  const blocked = result.aiAvailable && result.aiBlockedReason && !infra;
  if (infra) {
    return (
      <div className="panel tone-danger" role="alert">
        <div className="panel-title">שגיאת תשתית — הניתוח נעצר</div>
        <div className="panel-meta" style={{ marginTop: 6 }}>
          בקרת העלויות לא הצליחה לבדוק אם קיימת תוצאה שמורה, ולכן המערכת עצרה <strong>ולא פנתה ל-Claude</strong>. לא
          בוצע חיוב.
        </div>
        <div className="panel-meta" style={{ marginTop: 6, color: "var(--color-danger)" }}>{result.aiError}</div>
      </div>
    );
  }
  return (
    <div className={`panel ${failed ? "tone-danger" : blocked ? "tone-warn" : "tone-accent"}`}>
      <div className="panel-title">{failed ? "הניתוח הושלם חלקית" : "הניתוח הושלם"}</div>
      <div className="metric-list">
        {result.crawl && <span><strong>{result.crawl.pagesParsed}</strong>עמודים נותחו</span>}
        {result.aiAvailable && <span><strong>{result.aiServicesProposed}</strong>פריטים חדשים לבדיקה</span>}
        {result.aiAvailable && <span><strong>{result.aiServicesMerged}</strong>פריטים קיימים עודכנו</span>}
        <span><strong>{result.ownerServicesSeeded}</strong>נוספו מהקמת העסק</span>
      </div>
      {!result.aiAvailable && (
        <div className="panel-meta" style={{ marginTop: "var(--space-2)" }}>ניתוח AI אינו מוגדר - נקלטו רק שירותים שהוזנו בהקמת העסק.</div>
      )}
      {result.aiAvailable && result.costControl && <CostDecisionLine cc={result.costControl} />}
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
  // Paid "new run" is only ever started from the confirmation dialog, for
  // one run, and cleared as it starts (lib/paidRunFlow.ts).
  const [flow, dispatch] = useReducer(paidRunReducer, initialPaidRunState);
  const [latestRun, setLatestRun] = useState<BusinessAnalysisRun | null | undefined>(undefined);

  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => listenLatestAnalysisRun(business.id, setLatestRun), [business.id]);

  async function runAnalysis(paidNewRun: boolean) {
    setAnalyzing(true);
    setAnalyzeError(null);
    setAnalyzeResult(null);
    try {
      setAnalyzeResult(paidNewRun ? await analyzeBusinessNewPaidRun(business.id) : await analyzeBusiness(business.id));
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : "שגיאה בניתוח העסק");
    } finally {
      setAnalyzing(false);
      dispatch({ type: "finished" });
    }
  }

  function handleAnalyze() {
    dispatch({ type: "start" });
    void runAnalysis(false);
  }

  function handleConfirmPaidRun() {
    const next = paidRunReducer(flow, { type: "confirmNewRun" });
    dispatch({ type: "confirmNewRun" });
    void runAnalysis(runIsForced(next));
  }

  // A previous AI result exists for this business (from this session or a
  // recorded run) - only then does "run a new paid analysis" make sense.
  const hasPreviousResult =
    !!analyzeResult?.costControl?.inputHash || !!latestRun?.costControl?.inputHash || (latestRun?.aiAvailable && !latestRun?.aiError);
  const lastPaidCost =
    analyzeResult?.costControl?.providerCalled && analyzeResult.costControl.costUsd != null
      ? analyzeResult.costControl.costUsd
      : latestRun?.costControl?.providerCalled
        ? latestRun.costControl.costUsd
        : null;

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
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <div className="panel-row">
            {hasPreviousResult && (
              <button type="button" className="btn btn-quiet btn-sm" disabled={analyzing} onClick={() => dispatch({ type: "requestNewRun" })}>
                הרצת ניתוח חדש (בתשלום)…
              </button>
            )}
            <button type="button" className="btn btn-primary" disabled={analyzing} onClick={handleAnalyze}>
              {analyzing ? "מנתח…" : "נתח את העסק והאתר"}
            </button>
          </div>
          <span className="text-dim" style={{ fontSize: "0.78rem" }}>
            ללא עלות כשתוכן האתר לא השתנה · פנייה בתשלום ל-Claude רק כשהתוכן השתנה
          </span>
        </div>
      </div>

      {flow.phase === "confirming" && (
        <ConfirmPaidRunDialog
          providerLabel="Claude"
          lastCostUsd={lastPaidCost}
          estimateNote={AI_ESTIMATE_NOTE}
          onReuse={() => {
            dispatch({ type: "cancel" });
            handleAnalyze();
          }}
          onConfirmPaid={handleConfirmPaidRun}
          onClose={() => dispatch({ type: "cancel" })}
        />
      )}

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
