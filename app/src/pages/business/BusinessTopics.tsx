import { useEffect, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router-dom";
import { EmptyState } from "../../components/EmptyState";
import {
  listenBusinessKnowledge,
  createBusinessKnowledge,
  deleteBusinessKnowledge,
  listenBusinessServices,
  updateServiceStatus,
  updateServicePriority,
  createManualService,
  deleteBusinessService,
  listenSearchTopics,
  updateSearchTopicStatus,
  createManualTopic,
  listenCompetitors,
  addManualCompetitor,
  deleteCompetitor
} from "../../lib/firestore";
import { discoverFromSearchConsole, discoverFromSemrush, analyzeBusiness } from "../../lib/functions";
import type { DiscoveryResult, AnalyzeBusinessResult } from "../../lib/functions";
import {
  TOPIC_STATUS_LABELS,
  KNOWLEDGE_TYPE_LABELS,
  DISCOVERY_SOURCE_LABELS,
  SERVICE_SOURCE_LABELS,
  SERVICE_OWNER_STATUS_LABELS,
  PRIORITY_LABELS,
  FACET_DIMENSION_LABELS,
  FACET_PROVENANCE_LABELS
} from "../../types";
import type {
  BusinessKnowledge,
  SearchTopic,
  TopicStatus,
  KnowledgeType,
  Competitor,
  BusinessService,
  ServiceOwnerStatus,
  TaskPriority,
  FacetDimension,
  FacetValue
} from "../../types";
import type { BusinessContext } from "./BusinessWorkspace";

// Business & Service Discovery (roadmap Milestone 3.1) + Search Universe &
// Qualification (roadmap Milestone 3.2). The corrected pipeline this tab
// follows, top to bottom:
//
//   Business onboarding + Website understanding -> Business understanding
//   -> Service / Offer Map -> (owner validation) -> Search Discovery ->
//   Filtering -> Normalization -> Owner Validation -> Approved Search
//   Universe
//
// The website is evidence for understanding WHAT THE BUSINESS SELLS (the
// Service Map section below), never a direct source of search topics - a
// marketing/design website's own words are not a keyword database, which is
// why there's no "scan website" discovery button below anymore. Per the
// roadmap's explicit instruction, this tab stops at the approved search
// universe - no SEO/GEO task generation happens from anything here yet.

const REVIEW_STATUSES: TopicStatus[] = ["new", "unsure"];
const APPROVED_STATUSES: TopicStatus[] = ["relevant", "priority", "brand_strategic"];

function formatTimestamp(value: unknown): string {
  const ts = value as { toDate?: () => Date } | null | undefined;
  if (!ts?.toDate) return "—";
  return ts.toDate().toLocaleDateString("he-IL", { dateStyle: "short" });
}

function TopicStatusSelect({ topic }: { topic: SearchTopic }) {
  return (
    <select
      value={topic.status}
      onChange={(e) => updateSearchTopicStatus(topic.id, e.target.value as TopicStatus)}
      style={{
        background: "var(--color-bg)",
        color: "var(--color-text)",
        border: "1px solid var(--color-border)",
        borderRadius: 6,
        padding: "4px 8px",
        fontSize: "0.8rem"
      }}
    >
      {Object.entries(TOPIC_STATUS_LABELS).map(([val, label]) => (
        <option key={val} value={val}>{label}</option>
      ))}
    </select>
  );
}

function DiscoveryResultSummary({ result }: { result: DiscoveryResult }) {
  return (
    <span className="text-dim" style={{ fontSize: "0.78rem" }}>
      נמצאו {result.discovered} · נושאים חדשים {result.topicsCreated} · מוזגו {result.topicsMerged} · הוחרגו
      אוטומטית {result.excluded}
      {result.competitorsFound !== undefined ? ` · מתחרים שהתגלו ${result.competitorsFound}` : ""}
      {result.pagesScanned !== undefined ? ` · עמודים שנסרקו ${result.pagesScanned}` : ""}
      {result.cacheHit ? " · נעשה שימוש בתוצאה שמורה (לא נשלחה פנייה חדשה ל-Semrush)" : ""}
    </span>
  );
}

function selectStyle(): Record<string, string | number> {
  return {
    background: "var(--color-bg)",
    color: "var(--color-text)",
    border: "1px solid var(--color-border)",
    borderRadius: 6,
    padding: "4px 8px",
    fontSize: "0.8rem"
  };
}

function ServiceStatusSelect({ service }: { service: BusinessService }) {
  return (
    <select
      value={service.ownerStatus}
      onChange={(e) => updateServiceStatus(service.id, e.target.value as ServiceOwnerStatus)}
      style={selectStyle()}
    >
      {Object.entries(SERVICE_OWNER_STATUS_LABELS).map(([val, label]) => (
        <option key={val} value={val}>{label}</option>
      ))}
    </select>
  );
}

function ServicePrioritySelect({ service }: { service: BusinessService }) {
  return (
    <select
      value={service.priority}
      onChange={(e) => updateServicePriority(service.id, e.target.value as TaskPriority)}
      style={selectStyle()}
    >
      {Object.entries(PRIORITY_LABELS).map(([val, label]) => (
        <option key={val} value={val}>{label}</option>
      ))}
    </select>
  );
}

// Order the structured dimensions are shown in under each Service Map item.
const FACET_DISPLAY_ORDER: FacetDimension[] = [
  "services",
  "projectTypes",
  "markets",
  "audiences",
  "offerings",
  "positioning",
  "geographies",
  "needs"
];

// Three provenances, three distinct treatments - owner and website are
// never shown as the same thing:
//   owner        - filled chip, solid border (the owner said it)
//   website      - outlined chip, solid border (found in the site's text)
//   ai_inference - outlined chip, dashed border, muted text (interpretation)
// A small marker character repeats the distinction for anyone who can't
// rely on border style alone, and the tooltip names the provenance.
const FACET_PROVENANCE_MARKERS: Record<FacetValue["provenance"], string> = {
  owner: "●",
  website: "◆",
  ai_inference: "~"
};

function facetChipStyle(v: FacetValue): Record<string, string | number> {
  const base = { display: "inline-block", padding: "1px 7px", borderRadius: 999, fontSize: "0.72rem" };
  if (v.provenance === "owner") {
    return { ...base, border: "1px solid var(--color-border)", background: "var(--color-border)", color: "var(--color-text)" };
  }
  if (v.provenance === "website") {
    return { ...base, border: "1px solid var(--color-border)", color: "var(--color-text)" };
  }
  return { ...base, border: "1px dashed var(--color-border)", color: "var(--color-text-muted)" };
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname === "/" ? u.hostname : u.pathname;
  } catch {
    return url;
  }
}

// The structured interpretation underneath an item's human-readable name.
// Read-only on purpose: the owner confirms/rejects/edits the item itself,
// and these dimensions stay system-generated (with provenance on hover)
// unless a real need to hand-edit them shows up.
function ServiceFacetsView({ service }: { service: BusinessService }) {
  const facets = service.facets;
  const rows = FACET_DISPLAY_ORDER.filter((dim) => facets?.[dim] && facets[dim]!.length > 0);
  const evidence = service.evidenceSources && service.evidenceSources.length > 0 ? service.evidenceSources : null;

  return (
    <div style={{ marginTop: 4 }}>
      {rows.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {rows.map((dim) => (
            <div key={dim} style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
              <span className="text-dim" style={{ fontSize: "0.72rem", minWidth: 64 }}>{FACET_DIMENSION_LABELS[dim]}:</span>
              {facets![dim]!.map((v) => (
                <span
                  key={v.value}
                  style={facetChipStyle(v)}
                  title={`${FACET_PROVENANCE_LABELS[v.provenance]}${v.sourceUrl ? ` · ${v.sourceUrl}` : ""}`}
                >
                  <span aria-hidden="true" style={{ opacity: 0.7, marginInlineEnd: 3 }}>{FACET_PROVENANCE_MARKERS[v.provenance]}</span>
                  {v.value}
                </span>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-dim" style={{ fontSize: "0.72rem" }}>אין עדיין פירוק מבני - יתווסף בהרצת הניתוח הבאה</div>
      )}

      {evidence ? (
        <details style={{ marginTop: 4 }}>
          <summary className="text-dim" style={{ fontSize: "0.72rem", cursor: "pointer" }}>עדויות ומקורות ({evidence.length})</summary>
          <ul style={{ margin: "4px 0 0", paddingInlineStart: 18, fontSize: "0.72rem" }}>
            {evidence.map((e, i) => (
              <li key={i} className="text-dim">
                "{e.quote}"
                {e.sourceUrl && (
                  <>
                    {" — "}
                    <a href={e.sourceUrl} target="_blank" rel="noreferrer">{shortUrl(e.sourceUrl)}</a>
                  </>
                )}
                {!e.verified && " (לא אומת מול טקסט האתר)"}
              </li>
            ))}
          </ul>
        </details>
      ) : (
        service.evidence &&
        service.evidence.length > 0 && (
          <div className="text-dim" style={{ fontSize: "0.72rem", marginTop: 2 }}>עדות: {service.evidence.slice(0, 2).join(" · ")}</div>
        )
      )}
    </div>
  );
}

function AnalyzeResultSummary({ result }: { result: AnalyzeBusinessResult }) {
  return (
    <span className="text-dim" style={{ fontSize: "0.78rem" }}>
      שירותים מהקמת העסק: {result.ownerServicesSeeded}
      {result.crawl
        ? ` · עמודים: התגלו ${result.crawl.pagesDiscovered} · נטענו ${result.crawl.pagesFetched} · נותחו ${result.crawl.pagesParsed} · נכשלו ${result.crawl.failedCount} · דולגו ${result.crawl.skippedCount}`
        : ` · עמודים שנסרקו: ${result.pagesScanned}`}
      {result.aiAvailable ? (
        <>
          {` · הוצעו ע״י AI: ${result.aiServicesProposed} · מוזגו עם קיימים: ${result.aiServicesMerged}`}
          {result.aiCacheHit && " · נעשה שימוש בתוצאה קודמת (האתר לא השתנה - לא נשלחה פנייה חדשה ל-AI)"}
          {!result.aiCacheHit && result.aiCostUsd != null && ` · עלות הפנייה: $${result.aiCostUsd.toFixed(4)}`}
        </>
      ) : (
        " · ניתוח AI לא מוגדר עדיין"
      )}
    </span>
  );
}

const AI_BLOCKED_REASON_LABELS: Record<string, string> = {
  blocked_by_budget: "חסימת תקציב",
  blocked_by_quota: "חסימת מכסה",
  blocked_by_safety_limit: "חסימת מעגל בטיחות (כשלים חזרתיים)"
};

// Distinct from "AI not configured" (aiAvailable: false) and from a
// genuine failure (AnalyzeAiError below): this is the Universal External
// API Cost-Control Rule's own budget/quota/circuit-breaker guard
// (functions/apiUsage.js) deliberately refusing the call - a safety
// control doing its job, not a bug, so it gets its own distinct message.
function AnalyzeAiBlocked({ result }: { result: AnalyzeBusinessResult }) {
  if (!result.aiAvailable || !result.aiBlockedReason) return null;
  return (
    <p className="text-dim" style={{ fontSize: "0.78rem", marginBottom: 12 }}>
      ניתוח ה-AI נחסם ({AI_BLOCKED_REASON_LABELS[result.aiBlockedReason] || result.aiBlockedReason}): {result.aiError}
    </p>
  );
}

// Distinct from both of the above - a genuine failure (bad/placeholder
// key, network error, a response that didn't parse as JSON, or a website
// that couldn't be read), not "AI never ran" and not "blocked by our own
// cost control." Surfacing this distinction is the whole point of the
// aiError field - "AI never ran," "AI ran and failed," and "AI was
// blocked by our own budget/quota guard" used to all look identical from
// this screen.
function AnalyzeAiError({ result }: { result: AnalyzeBusinessResult }) {
  if (!result.aiAvailable || result.aiBlockedReason || !result.aiError) return null;
  return <div className="login-error">ניתוח ה-AI נכשל: {result.aiError}</div>;
}

export default function BusinessTopics() {
  const { business } = useOutletContext<BusinessContext>();
  const [knowledge, setKnowledge] = useState<BusinessKnowledge[] | null>(null);
  const [services, setServices] = useState<BusinessService[] | null>(null);
  const [topics, setTopics] = useState<SearchTopic[] | null>(null);
  const [competitors, setCompetitors] = useState<Competitor[] | null>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeBusinessResult | null>(null);
  // Universal External API Cost-Control Rule: a cached result is reused by
  // default (see functions/apiUsage.js) - this checkbox is the explicit
  // "ignore a valid cache" escape hatch the rule requires force-refresh to
  // be, never a way around the budget/quota/circuit-breaker checks below it.
  const [forceRefreshAi, setForceRefreshAi] = useState(false);

  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceDescription, setNewServiceDescription] = useState("");
  const [addingService, setAddingService] = useState(false);

  const [runningSource, setRunningSource] = useState<string | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ source: string; result: DiscoveryResult } | null>(null);
  const [semrushSeed, setSemrushSeed] = useState("");
  const [forceRefreshSemrush, setForceRefreshSemrush] = useState(false);

  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [newTopicNotes, setNewTopicNotes] = useState("");
  const [addingTopic, setAddingTopic] = useState(false);

  const [knowledgeType, setKnowledgeType] = useState<KnowledgeType>("exclusion_rule");
  const [knowledgeContent, setKnowledgeContent] = useState("");
  const [addingKnowledge, setAddingKnowledge] = useState(false);

  const [newCompetitorDomain, setNewCompetitorDomain] = useState("");

  useEffect(() => {
    if (!business) return;
    const unsub1 = listenBusinessKnowledge(business.id, setKnowledge);
    const unsub2 = listenSearchTopics(business.id, setTopics);
    const unsub3 = listenCompetitors(business.id, setCompetitors);
    const unsub4 = listenBusinessServices(business.id, setServices);
    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
    };
  }, [business]);

  if (!business) return <div className="loading-row">טוען…</div>;

  async function handleAnalyzeBusiness() {
    if (!business) return;
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const result = await analyzeBusiness(business.id, forceRefreshAi);
      setAnalyzeResult(result);
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : "שגיאה בניתוח העסק");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleAddService(e: FormEvent) {
    e.preventDefault();
    if (!business || !newServiceName.trim()) return;
    setAddingService(true);
    try {
      await createManualService(business.id, newServiceName.trim(), newServiceDescription.trim() || undefined);
      setNewServiceName("");
      setNewServiceDescription("");
    } finally {
      setAddingService(false);
    }
  }

  async function runDiscovery(source: "gsc" | "semrush") {
    if (!business) return;
    setRunningSource(source);
    setDiscoveryError(null);
    try {
      let result: DiscoveryResult;
      if (source === "gsc") result = await discoverFromSearchConsole(business.id);
      else {
        if (!semrushSeed.trim()) {
          setDiscoveryError("יש לבחור שירות מאושר או להזין מילת מפתח מקור (seed phrase) להרצת Semrush");
          setRunningSource(null);
          return;
        }
        result = await discoverFromSemrush(business.id, semrushSeed.trim(), undefined, forceRefreshSemrush);
      }
      setLastResult({ source, result });
    } catch (err) {
      setDiscoveryError(err instanceof Error ? err.message : "שגיאה בגילוי");
    } finally {
      setRunningSource(null);
    }
  }

  async function handleAddTopic(e: FormEvent) {
    e.preventDefault();
    if (!business || !newTopicTitle.trim()) return;
    setAddingTopic(true);
    try {
      await createManualTopic(business.id, newTopicTitle.trim(), newTopicNotes.trim() || undefined);
      setNewTopicTitle("");
      setNewTopicNotes("");
    } finally {
      setAddingTopic(false);
    }
  }

  async function handleAddKnowledge(e: FormEvent) {
    e.preventDefault();
    if (!business || !knowledgeContent.trim()) return;
    setAddingKnowledge(true);
    try {
      await createBusinessKnowledge({ businessId: business.id, type: knowledgeType, content: knowledgeContent.trim() });
      setKnowledgeContent("");
    } finally {
      setAddingKnowledge(false);
    }
  }

  async function handleAddCompetitor(e: FormEvent) {
    e.preventDefault();
    if (!business || !newCompetitorDomain.trim()) return;
    await addManualCompetitor(business.id, newCompetitorDomain.trim());
    setNewCompetitorDomain("");
  }

  const reviewTopics = (topics || []).filter((t) => REVIEW_STATUSES.includes(t.status));
  const approvedTopics = (topics || []).filter((t) => APPROVED_STATUSES.includes(t.status));
  const confirmedServices = (services || []).filter((s) => s.ownerStatus === "confirmed");
  const needsReviewServices = (services || []).filter((s) => s.ownerStatus === "needs_review");
  const otherServices = (services || []).filter((s) => s.ownerStatus === "rejected");

  return (
    <div className="section-block">
      <h2 className="section-title">הבנת העסק ונושאי חיפוש</h2>
      <p className="text-dim" style={{ fontSize: "0.82rem", marginTop: -8, marginBottom: 20 }}>
        הבנת העסק ← מפת שירותים (אימות בעל/ת העסק) ← גילוי חיפוש ← סינון ← נורמליזציה ← אימות בעל/ת העסק ← יקום חיפוש
        מאושר. יצירת משימות SEO/GEO מתוך הנושאים המאושרים מתוכננת לשלב הבא.
      </p>

      {/* --- Business Understanding & Service Map --- */}
      <div className="table-toolbar" style={{ marginBottom: 12 }}>
        <h3 className="section-title" style={{ marginBottom: 0, fontSize: "1rem" }}>הבנת העסק ומפת שירותים</h3>
      </div>
      <p className="text-dim" style={{ fontSize: "0.78rem", marginBottom: 12 }}>
        לפני שמחפשים מה העסק צריך להיראות עבורו, המערכת צריכה להבין מה העסק בעצם מוכר. האתר הוא עדות לכך, לא מאגר
        מילות מפתח - לכן הניתוח קורא את האתר כדי להציע שירותים לאימות, ולא יוצר נושאי חיפוש ישירות מהטקסט שבו.
      </p>
      {analyzeError && <div className="login-error">{analyzeError}</div>}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
        <button type="button" className="btn btn-outline" disabled={analyzing} onClick={handleAnalyzeBusiness}>
          {analyzing ? "מנתח…" : "נתח את העסק והאתר"}
        </button>
        <label className="text-dim" style={{ fontSize: "0.78rem", display: "flex", alignItems: "center", gap: 4 }}>
          <input type="checkbox" checked={forceRefreshAi} onChange={(e) => setForceRefreshAi(e.target.checked)} />
          התעלם מתוצאה שמורה (רענון בכפייה)
        </label>
        {analyzeResult && <AnalyzeResultSummary result={analyzeResult} />}
      </div>
      {analyzeResult && <AnalyzeAiBlocked result={analyzeResult} />}
      {analyzeResult && <AnalyzeAiError result={analyzeResult} />}
      {analyzeResult && !analyzeResult.aiAvailable && (
        <p className="text-dim" style={{ fontSize: "0.78rem", marginBottom: 12 }}>
          ניתוח AI (הצעת שירותים נוספים מתוך האתר) ממתין להגדרת מפתח Anthropic API - שירותים שהוגדרו בהקמת העסק עדיין
          נקלטים באופן מיידי.
        </p>
      )}

      {services === null && <div className="loading-row">טוען…</div>}

      {services !== null && services.length === 0 && (
        <EmptyState title="אין עדיין מפת שירותים" subtitle="לחץ 'נתח את העסק והאתר' למעלה, או הוסף שירות ידנית מטה." />
      )}

      {services !== null && services.length > 0 && (
        <p className="text-dim" style={{ fontSize: "0.72rem", marginBottom: 6 }}>
          מתחת לכל פריט מוצג הפירוק המבני שהמערכת הסיקה. ● מלא = הוזן ע״י בעל/ת העסק · ◆ מסגרת רציפה = מופיע בטקסט האתר
          · ~ מסגרת מקווקוות = פרשנות AI. ריחוף מעל ערך מציג את מקורו ואת עמוד המקור.
        </p>
      )}

      {services !== null && services.length > 0 && (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>שירות</th>
                <th>מקור</th>
                <th>עדיפות</th>
                <th>סטטוס</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {[...needsReviewServices, ...confirmedServices, ...otherServices].map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.name}</strong>
                    {s.description && <div className="text-muted" style={{ fontSize: "0.78rem", marginTop: 2 }}>{s.description}</div>}
                    <ServiceFacetsView service={s} />
                  </td>
                  <td className="text-muted">{SERVICE_SOURCE_LABELS[s.source]}</td>
                  <td><ServicePrioritySelect service={s} /></td>
                  <td><ServiceStatusSelect service={s} /></td>
                  <td>
                    <button className="btn btn-danger-outline btn-sm" onClick={() => deleteBusinessService(s.id)}>מחיקה</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form onSubmit={handleAddService} className="form-row" style={{ marginTop: 14, alignItems: "flex-end" }}>
        <div className="form-field">
          <label htmlFor="service-name">הוספת שירות ידנית</label>
          <input id="service-name" value={newServiceName} onChange={(e) => setNewServiceName(e.target.value)} placeholder="שם השירות" />
        </div>
        <div className="form-field">
          <label htmlFor="service-desc">תיאור (אופציונלי)</label>
          <input id="service-desc" value={newServiceDescription} onChange={(e) => setNewServiceDescription(e.target.value)} />
        </div>
        <div className="form-field" style={{ flex: "0 0 auto" }}>
          <button type="submit" className="btn btn-primary" disabled={addingService || !newServiceName.trim()}>
            {addingService ? "מוסיף…" : "+ הוספה"}
          </button>
        </div>
      </form>

      {/* --- Search Discovery --- */}
      <div className="table-toolbar" style={{ marginTop: 32, marginBottom: 12 }}>
        <h3 className="section-title" style={{ marginBottom: 0, fontSize: "1rem" }}>גילוי חיפוש</h3>
      </div>
      {discoveryError && <div className="login-error">{discoveryError}</div>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <button
          type="button"
          className="btn btn-outline"
          disabled={runningSource !== null}
          onClick={() => runDiscovery("gsc")}
        >
          {runningSource === "gsc" ? "סורק…" : "גילוי מ-Search Console"}
        </button>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            value={semrushSeed}
            onChange={(e) => setSemrushSeed(e.target.value)}
            placeholder={confirmedServices.length > 0 ? "בחר שירות מאושר או הקלד..." : "מילת מפתח מקור ל-Semrush"}
            list="confirmed-services-datalist"
            style={{
              background: "var(--color-bg)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: "0.82rem",
              width: 220
            }}
          />
          <datalist id="confirmed-services-datalist">
            {confirmedServices.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
          <button
            type="button"
            className="btn btn-outline"
            disabled={runningSource !== null}
            onClick={() => runDiscovery("semrush")}
          >
            {runningSource === "semrush" ? "מריץ…" : "גילוי מ-Semrush"}
          </button>
          <label className="text-dim" style={{ fontSize: "0.78rem", display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="checkbox"
              checked={forceRefreshSemrush}
              onChange={(e) => setForceRefreshSemrush(e.target.checked)}
            />
            התעלם מתוצאה שמורה
          </label>
        </div>
      </div>
      <p className="text-dim" style={{ fontSize: "0.78rem", marginBottom: 12 }}>
        Search Console משקף נראות קיימת בגוגל, לא את כל יקום החיפוש הרלוונטי. Semrush מומלץ להריץ עם שם שירות מאושר
        ממפת השירותים למעלה כמילת מפתח מקור. Semrush ממתין להקצאת יחידות API בחשבון הקיים - ההרצה תחזיר שגיאה ברורה
        עד שייוגדר מפתח API אמיתי.
      </p>
      {lastResult && (
        <div style={{ marginBottom: 16 }}>
          <strong style={{ fontSize: "0.82rem" }}>{DISCOVERY_SOURCE_LABELS[lastResult.source as keyof typeof DISCOVERY_SOURCE_LABELS] || lastResult.source}:</strong>{" "}
          <DiscoveryResultSummary result={lastResult.result} />
        </div>
      )}

      {/* --- Review queue --- */}
      <div className="table-toolbar" style={{ marginTop: 28, marginBottom: 12 }}>
        <h3 className="section-title" style={{ marginBottom: 0, fontSize: "1rem" }}>
          לבדיקה {topics !== null && `(${reviewTopics.length})`}
        </h3>
      </div>

      {topics === null && <div className="loading-row">טוען…</div>}

      {topics !== null && reviewTopics.length === 0 && (
        <EmptyState title="אין נושאים לבדיקה" subtitle="הרץ גילוי מלמעלה, או הוסף נושא ידנית מטה." />
      )}

      {reviewTopics.length > 0 && (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>נושא</th>
                <th>מקור</th>
                <th>מילות חיפוש</th>
                <th>סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {reviewTopics.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.title}</strong>
                    {t.notes && <div className="text-muted" style={{ fontSize: "0.78rem", marginTop: 2 }}>{t.notes}</div>}
                  </td>
                  <td className="text-muted">{DISCOVERY_SOURCE_LABELS[t.source]}</td>
                  <td className="text-muted">{t.queries.length}</td>
                  <td><TopicStatusSelect topic={t} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form onSubmit={handleAddTopic} className="form-row" style={{ marginTop: 14, alignItems: "flex-end" }}>
        <div className="form-field">
          <label htmlFor="topic-title">הוספת נושא ידנית</label>
          <input id="topic-title" value={newTopicTitle} onChange={(e) => setNewTopicTitle(e.target.value)} placeholder="כותרת / מילת חיפוש" />
        </div>
        <div className="form-field">
          <label htmlFor="topic-notes">הערות (אופציונלי)</label>
          <input id="topic-notes" value={newTopicNotes} onChange={(e) => setNewTopicNotes(e.target.value)} />
        </div>
        <div className="form-field" style={{ flex: "0 0 auto" }}>
          <button type="submit" className="btn btn-primary" disabled={addingTopic || !newTopicTitle.trim()}>
            {addingTopic ? "מוסיף…" : "+ הוספה"}
          </button>
        </div>
      </form>

      {/* --- Approved Search Universe --- */}
      <div className="table-toolbar" style={{ marginTop: 32, marginBottom: 12 }}>
        <h3 className="section-title" style={{ marginBottom: 0, fontSize: "1rem" }}>
          יקום חיפוש מאושר {topics !== null && `(${approvedTopics.length})`}
        </h3>
      </div>

      {topics !== null && approvedTopics.length === 0 && (
        <EmptyState title="אין עדיין נושאים מאושרים" subtitle="נושאים שיאושרו/יתועדפו/יסומנו כמותג-אסטרטגי יופיעו כאן." />
      )}

      {approvedTopics.length > 0 && (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>נושא</th>
                <th>מקור</th>
                <th>נוסף ע״י</th>
                <th>סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {approvedTopics.map((t) => (
                <tr key={t.id}>
                  <td><strong>{t.title}</strong></td>
                  <td className="text-muted">{DISCOVERY_SOURCE_LABELS[t.source]}</td>
                  <td className="text-muted">{t.addedBy === "owner" ? "בעל/ת העסק" : "מערכת"}</td>
                  <td><TopicStatusSelect topic={t} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* --- Competitors found --- */}
      <div className="table-toolbar" style={{ marginTop: 32, marginBottom: 12 }}>
        <h3 className="section-title" style={{ marginBottom: 0, fontSize: "1rem" }}>מתחרים</h3>
      </div>

      {competitors !== null && competitors.length === 0 && (
        <EmptyState title="אין עדיין מתחרים" subtitle="גילוי Semrush יזהה מתחרים אוטומטית לאחר שייוגדר מפתח API." />
      )}

      {competitors && competitors.length > 0 && (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>דומיין</th>
                <th>רלוונטיות</th>
                <th>מילות מפתח משותפות</th>
                <th>זוהה באמצעות</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {competitors.map((c) => (
                <tr key={c.id}>
                  <td dir="ltr" style={{ textAlign: "right" }}>{c.domain}</td>
                  <td className="text-muted">{c.relevanceScore ?? "—"}</td>
                  <td className="text-muted">{c.sharedKeywordCount ?? "—"}</td>
                  <td className="text-muted">{c.discoveredVia === "manual" ? "ידני" : "Semrush"}</td>
                  <td>
                    <button className="btn btn-danger-outline btn-sm" onClick={() => deleteCompetitor(c.id)}>מחיקה</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form onSubmit={handleAddCompetitor} className="form-row" style={{ marginTop: 14, alignItems: "flex-end" }}>
        <div className="form-field">
          <label htmlFor="competitor-domain">הוספת מתחרה ידנית</label>
          <input id="competitor-domain" dir="ltr" value={newCompetitorDomain} onChange={(e) => setNewCompetitorDomain(e.target.value)} placeholder="example.com" />
        </div>
        <div className="form-field" style={{ flex: "0 0 auto" }}>
          <button type="submit" className="btn btn-primary" disabled={!newCompetitorDomain.trim()}>+ הוספה</button>
        </div>
      </form>

      {/* --- Business knowledge --- */}
      <div className="table-toolbar" style={{ marginTop: 32, marginBottom: 12 }}>
        <h3 className="section-title" style={{ marginBottom: 0, fontSize: "1rem" }}>מה המערכת יודעת על העסק</h3>
      </div>
      <p className="text-dim" style={{ fontSize: "0.78rem", marginBottom: 12 }}>
        כללי החרגה כאן מסננים אוטומטית מועמדים עתידיים שהגילוי מביא. זו שכבת ידע נפרדת מפרופיל העסק - "מה המערכת
        יודעת/לומדת", לא "מה העסק הוא".
      </p>

      {knowledge !== null && knowledge.length === 0 && (
        <EmptyState title="אין עדיין רשומות ידע" subtitle="הוסף כלל החרגה, עדיפות אסטרטגית, מינוח מותג או כלל עסקי מטה." />
      )}

      {knowledge && knowledge.length > 0 && (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>סוג</th>
                <th>תוכן</th>
                <th>מקור</th>
                <th>נוסף בתאריך</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {knowledge.map((k) => (
                <tr key={k.id}>
                  <td className="text-muted">{KNOWLEDGE_TYPE_LABELS[k.type]}</td>
                  <td>{k.content}</td>
                  <td className="text-muted">{k.source === "owner" ? "בעל/ת העסק (נצפה)" : "מערכת (הסקה)"}</td>
                  <td className="text-muted">{formatTimestamp(k.createdAt)}</td>
                  <td>
                    <button className="btn btn-danger-outline btn-sm" onClick={() => deleteBusinessKnowledge(k.id)}>מחיקה</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form onSubmit={handleAddKnowledge} className="form-row" style={{ marginTop: 14, alignItems: "flex-end" }}>
        <div className="form-field">
          <label htmlFor="knowledge-type">סוג</label>
          <select id="knowledge-type" value={knowledgeType} onChange={(e) => setKnowledgeType(e.target.value as KnowledgeType)}>
            {Object.entries(KNOWLEDGE_TYPE_LABELS)
              .filter(([val]) => val !== "discovered_fact" && val !== "learned_insight")
              .map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="knowledge-content">תוכן</label>
          <input id="knowledge-content" value={knowledgeContent} onChange={(e) => setKnowledgeContent(e.target.value)} placeholder="לדוגמה: להחריג כל מועמד שמכיל 'משרה'" />
        </div>
        <div className="form-field" style={{ flex: "0 0 auto" }}>
          <button type="submit" className="btn btn-primary" disabled={addingKnowledge || !knowledgeContent.trim()}>
            {addingKnowledge ? "מוסיף…" : "+ הוספה"}
          </button>
        </div>
      </form>
    </div>
  );
}
