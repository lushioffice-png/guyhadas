import { useReducer, useState } from "react";
import {
  buildSearchSeeds,
  discoverFromSearchConsole,
  discoverFromSemrushSeed,
  discoverFromSemrushSeedNewPaidRun,
  discoverDomainFromSemrush,
  discoverDomainFromSemrushNewPaidRun,
  governedDetails
} from "../../../lib/functions";
import type { DiscoveryResult } from "../../../lib/functions";
import { ConfirmPaidRunDialog } from "../../../components/review/ConfirmPaidRunDialog";
import { initialPaidRunState, paidRunReducer, runIsForced } from "../../../lib/paidRunFlow";
import { PROVENANCE_META } from "../../../components/review/provenance";
import { Badge } from "../../../components/review/Badge";
import { FACET_DIMENSION_LABELS, SEED_KIND_LABELS, SEED_SKIP_REASON_LABELS } from "../../../types";
import type { Business, SearchSeed, SeedBuildResult, SeedComponent } from "../../../types";

// M3.2 discovery panel: seeds come ONLY from the confirmed Service Map
// (built server-side, functions/seedBuilder.js) - no free-text seed box.
// Nothing here calls anything on render; every call is a button press.

type Target = { kind: "seed"; seed: SearchSeed } | { kind: "domain" } | { kind: "gsc" };

const DECISION_LABELS: Record<string, string> = {
  cache_hit: "תוצאה שמורה - ללא פנייה ל-Semrush, ללא עלות",
  cache_miss: "פנייה חדשה ל-Semrush (בתשלום ביחידות API)",
  forced_refresh: "שליפה חדשה שאישרת (בתשלום)",
  blocked_cache_unavailable: "נחסם: בדיקת המטמון לא הצליחה - לא בוצעה פנייה",
  blocked_safety_check_unavailable: "נחסם: בדיקת תקציב/בטיחות לא הצליחה - לא בוצעה פנייה",
  blocked_by_quota: "נחסם: הגעת למכסת הפניות - לא בוצעה פנייה",
  blocked_by_budget: "נחסם: מעבר לתקציב - לא בוצעה פנייה",
  blocked_by_safety_limit: "נחסם: מפסק הגנה פתוח אחרי כשלים - לא בוצעה פנייה"
};

export function SeedComponentChip({ c }: { c: SeedComponent & { origin?: string; pageCount?: number | null } }) {
  const meta = PROVENANCE_META[c.provenance] || PROVENANCE_META.ai_inference;
  const tip = [`${FACET_DIMENSION_LABELS[c.dimension]} · ${meta.label}`, c.origin === "business_profile" ? "מתוך אזורי השוק בפרופיל העסק" : "", c.pageCount ? `נמצא ב-${c.pageCount} עמודים` : ""]
    .filter(Boolean)
    .join("\n");
  return (
    <span className={`facet-chip prov-${c.provenance}`} title={tip}>
      <span className="prov-mark" aria-label={meta.label}>{meta.icon}</span>
      {c.value}
    </span>
  );
}

function ResultSummary({ result }: { result: DiscoveryResult }) {
  return (
    <div className="metric-list">
      <span><strong>{result.discovered}</strong>שאילתות שהתקבלו</span>
      <span><strong>{result.topicsCreated}</strong>נושאים חדשים</span>
      <span><strong>{result.topicsMerged}</strong>צורפו לנושא קיים</span>
      <span><strong>{result.refreshed}</strong>עודכנו (כבר היו)</span>
      <span><strong>{result.excluded}</strong>הוחרגו לפי כלל שלך</span>
      {result.competitorsFound !== undefined && <span><strong>{result.competitorsFound}</strong>מתחרים</span>}
      {result.providerUnitsUsed ? <span><strong>{result.providerUnitsUsed}</strong>יחידות API</span> : null}
    </div>
  );
}

export function SeedDiscoveryPanel({ business, confirmedCount }: { business: Business; confirmedCount: number }) {
  const [built, setBuilt] = useState<SeedBuildResult | null>(null);
  const [building, setBuilding] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<{ text: string; decision?: string } | null>(null);
  const [last, setLast] = useState<{ label: string; result: DiscoveryResult } | null>(null);
  const [lastHitTarget, setLastHitTarget] = useState<string | null>(null);
  const [flow, dispatch] = useReducer(paidRunReducer, initialPaidRunState);
  const [pending, setPending] = useState<Target | null>(null);
  const [showSkipped, setShowSkipped] = useState(false);

  const targetId = (t: Target) => (t.kind === "seed" ? t.seed.seedKey : t.kind);
  const targetLabel = (t: Target) => (t.kind === "seed" ? `Semrush: ${t.seed.phrase}` : t.kind === "domain" ? "Semrush: הדומיין והמתחרים" : "Search Console");

  async function rebuild() {
    setBuilding(true);
    setError(null);
    try {
      setBuilt(await buildSearchSeeds(business.id));
    } catch (err) {
      setError({ text: err instanceof Error ? err.message : "שגיאה בבניית seeds" });
    } finally {
      setBuilding(false);
    }
  }

  async function run(t: Target, paid = false) {
    const id = targetId(t);
    setRunning(id);
    setError(null);
    try {
      let result: DiscoveryResult;
      if (t.kind === "gsc") result = await discoverFromSearchConsole(business.id);
      else if (t.kind === "domain") result = paid ? await discoverDomainFromSemrushNewPaidRun(business.id) : await discoverDomainFromSemrush(business.id);
      else result = paid ? await discoverFromSemrushSeedNewPaidRun(business.id, t.seed.seedKey) : await discoverFromSemrushSeed(business.id, t.seed.seedKey);
      setLast({ label: targetLabel(t), result });
      setLastHitTarget(result.cacheHit ? id : null);
    } catch (err) {
      const d = governedDetails(err);
      setError({ text: err instanceof Error ? err.message : "שגיאה בגילוי", decision: d?.blockedReason || d?.cacheDecision });
    } finally {
      setRunning(null);
      if (t.kind !== "gsc") dispatch({ type: "finished" });
    }
  }

  const busy = running !== null;
  const seedsByService = new Map<string, SearchSeed[]>();
  for (const s of built?.seeds || []) seedsByService.set(s.serviceName, [...(seedsByService.get(s.serviceName) || []), s]);

  const runButton = (t: Target, label: string) => {
    const id = targetId(t);
    return (
      <span style={{ display: "inline-flex", gap: 6 }}>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={busy}
          onClick={() => {
            if (t.kind !== "gsc") dispatch({ type: "start" });
            void run(t);
          }}
        >
          {running === id ? "מריץ…" : label}
        </button>
        {lastHitTarget === id && t.kind !== "gsc" && (
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={busy}
            onClick={() => {
              setPending(t);
              dispatch({ type: "requestNewRun" });
            }}
          >
            שליפה חדשה (בתשלום)…
          </button>
        )}
      </span>
    );
  };

  return (
    <div className="panel">
      <div className="panel-title" style={{ marginBottom: "var(--space-2)" }}>גילוי נושאי חיפוש ממפת השירותים</div>
      <p className="panel-meta" style={{ margin: "0 0 var(--space-3)" }}>
        ה-seeds נבנים רק משירותים שאישרת ({confirmedCount}) - בלי תיבת טקסט חופשית. אזורי שירות שהגדרת בפרופיל העסק קודמים
        לאזורים שמופיעים באתר; מיקום של פרויקט בודד לא הופך ליעד. Search Console חינמי ומשקף נראות קיימת; Semrush משקף ביקוש
        בשוק ועולה יחידות API (שליפה זהה תוך 24 שעות חוזרת מהמטמון ללא עלות).
      </p>

      <div className="panel-row">
        <button type="button" className="btn btn-outline" disabled={building || busy} onClick={rebuild}>
          {building ? "בונה…" : built ? "רענון רשימת ה-seeds" : "בניית seeds ממפת השירותים"}
        </button>
        <span className="text-dim" aria-hidden="true">|</span>
        {runButton({ kind: "gsc" }, "גילוי מ-Search Console")}
        {runButton({ kind: "domain" }, "Semrush: מה הדומיין כבר מדורג + מתחרים (עד 900 יח׳)")}
      </div>

      {built && (
        <div style={{ marginTop: "var(--space-4)" }}>
          {built.seeds.length === 0 && (
            <p className="text-dim" style={{ fontSize: "0.88rem" }}>
              אין seeds - צריך לפחות שירות אחד מאושר במפת השירותים.
            </p>
          )}
          {[...seedsByService.entries()].map(([serviceName, seeds]) => (
            <div key={serviceName} style={{ marginBottom: "var(--space-3)" }}>
              <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: 6 }}>{serviceName}</div>
              <ul className="evidence-list" style={{ marginTop: 0 }}>
                {seeds.map((s) => (
                  <li key={s.seedKey} className="evidence-item" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6, alignItems: "center" }} title={s.explanation}>
                      <strong>{s.phrase}</strong>
                      <Badge tone="outline">{SEED_KIND_LABELS[s.kind]}</Badge>
                      {s.components.map((c, i) => (
                        <SeedComponentChip key={i} c={c} />
                      ))}
                    </span>
                    {runButton({ kind: "seed", seed: s }, "Semrush (עד 1,200 יח׳)")}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {(built.skipped.length > 0 || built.droppedByCap > 0) && (
            <>
              <button type="button" className="disclosure" aria-expanded={showSkipped} onClick={() => setShowSkipped((v) => !v)}>
                ערכים שלא הפכו ל-seed ({built.skipped.length}{built.droppedByCap ? ` + ${built.droppedByCap} מעבר למכסה` : ""}) <span className="chev" aria-hidden="true">▾</span>
              </button>
              {showSkipped && (
                <ul className="evidence-list">
                  {built.skipped.map((k, i) => (
                    <li key={i} className="evidence-item" style={{ padding: "6px 12px" }}>
                      <strong>{k.value}</strong> · {FACET_DIMENSION_LABELS[k.dimension]} · {k.serviceName} — {SEED_SKIP_REASON_LABELS[k.reason]}
                      {k.rule ? ` („${k.rule}“)` : ""}
                      {k.reason === "script_mismatch" ? " - כדי לטרגט אזור, הוסף/י את שמו בעברית לאזורי השוק בפרופיל העסק." : ""}
                      {k.reason === "project_location_signal" ? " - אם זה אזור שירות אמיתי, הוסף/י אותו לאזורי השוק בפרופיל העסק." : ""}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      {flow.phase === "confirming" && pending && (
        <ConfirmPaidRunDialog
          providerLabel="Semrush"
          estimateNote={pending.kind === "domain" ? "עלות משוערת: עד 900 יחידות API של Semrush." : "עלות משוערת: עד 1,200 יחידות API של Semrush."}
          onReuse={() => dispatch({ type: "cancel" })}
          onConfirmPaid={() => {
            const next = paidRunReducer(flow, { type: "confirmNewRun" });
            dispatch({ type: "confirmNewRun" });
            void run(pending, runIsForced(next));
          }}
          onClose={() => dispatch({ type: "cancel" })}
        />
      )}

      {error && (
        <div className="login-error" style={{ marginTop: "var(--space-3)", marginBottom: 0 }}>
          {error.decision && DECISION_LABELS[error.decision] ? `${DECISION_LABELS[error.decision]}. ` : ""}
          {error.text}
        </div>
      )}
      {last && (
        <div style={{ marginTop: "var(--space-3)" }}>
          <strong style={{ fontSize: "0.88rem" }}>{last.label}</strong>
          {last.result.cacheDecision && (
            <div className="panel-meta" style={{ margin: "4px 0" }}>{DECISION_LABELS[last.result.cacheDecision] || last.result.cacheDecision}</div>
          )}
          <ResultSummary result={last.result} />
        </div>
      )}
    </div>
  );
}
