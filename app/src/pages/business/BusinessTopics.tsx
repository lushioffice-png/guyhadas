import { useEffect, useReducer, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router-dom";
import { EmptyState } from "../../components/EmptyState";
import {
  listenBusinessKnowledge,
  createBusinessKnowledge,
  deleteBusinessKnowledge,
  listenBusinessServices,
  listenSearchTopics,
  createManualTopic,
  listenCompetitors,
  addManualCompetitor,
  deleteCompetitor
} from "../../lib/firestore";
import { discoverFromSearchConsole, discoverFromSemrush, discoverFromSemrushNewPaidRun } from "../../lib/functions";
import { ConfirmPaidRunDialog } from "../../components/review/ConfirmPaidRunDialog";
import { initialPaidRunState, paidRunReducer, runIsForced } from "../../lib/paidRunFlow";
import type { DiscoveryResult } from "../../lib/functions";
import { KNOWLEDGE_TYPE_LABELS, DISCOVERY_SOURCE_LABELS } from "../../types";
import type { BusinessKnowledge, SearchTopic, TopicStatus, KnowledgeType, Competitor, BusinessService } from "../../types";
import type { BusinessContext } from "./BusinessWorkspace";
import { updateSearchTopicStatus } from "../../lib/firestore";
import { ConfirmDeleteButton } from "../../components/review/ConfirmDeleteButton";
import { Badge } from "../../components/review/Badge";
import { ServiceMapSection } from "./topics/ServiceMapSection";
import { SearchTopicCard } from "./topics/SearchTopicCard";

// Business & Service Discovery (roadmap M3.1) + Search Universe &
// Qualification. The tab follows the pipeline top to bottom:
//
//   Business understanding -> Service Map (owner validation) -> Search
//   Discovery -> Filtering -> Normalization -> Owner Validation ->
//   Approved Search Universe
//
// The website is evidence for understanding WHAT THE BUSINESS SELLS (the
// Service Map), never a direct source of search topics. This tab stops at
// the approved search universe - no SEO/GEO task generation happens here.

const REVIEW_STATUSES: TopicStatus[] = ["new", "unsure"];
const APPROVED_STATUSES: TopicStatus[] = ["relevant", "priority", "brand_strategic"];

const PIPELINE = ["העסק", "הבנת העסק", "מפת שירותים", "יקום חיפוש", "SEO + GEO", "הזדמנויות", "משימות", "מדידה", "למידה"];
const CURRENT_STEPS = new Set(["מפת שירותים", "יקום חיפוש"]);

function formatDate(value: unknown): string {
  const ts = value as { toDate?: () => Date } | null | undefined;
  if (!ts?.toDate) return "—";
  return ts.toDate().toLocaleDateString("he-IL", { dateStyle: "short" });
}

function DiscoveryResultSummary({ result }: { result: DiscoveryResult }) {
  return (
    <div className="metric-list">
      <span><strong>{result.discovered}</strong>נמצאו</span>
      <span><strong>{result.topicsCreated}</strong>נושאים חדשים</span>
      <span><strong>{result.topicsMerged}</strong>מוזגו לקיימים</span>
      <span><strong>{result.excluded}</strong>הוחרגו אוטומטית</span>
      {result.competitorsFound !== undefined && <span><strong>{result.competitorsFound}</strong>מתחרים</span>}
      {result.cacheHit && <span>נעשה שימוש בתוצאה שמורה (ללא פנייה חדשה ל-Semrush)</span>}
    </div>
  );
}

export default function BusinessTopics() {
  const { business } = useOutletContext<BusinessContext>();
  const [knowledge, setKnowledge] = useState<BusinessKnowledge[] | null>(null);
  const [services, setServices] = useState<BusinessService[] | null>(null);
  const [topics, setTopics] = useState<SearchTopic[] | null>(null);
  const [competitors, setCompetitors] = useState<Competitor[] | null>(null);

  const [runningSource, setRunningSource] = useState<string | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ source: string; result: DiscoveryResult } | null>(null);
  const [semrushSeed, setSemrushSeed] = useState("");
  // Paid "new Semrush pull" only via the confirmation dialog (lib/paidRunFlow.ts).
  const [semrushFlow, dispatchSemrush] = useReducer(paidRunReducer, initialPaidRunState);

  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [newTopicNotes, setNewTopicNotes] = useState("");
  const [addingTopic, setAddingTopic] = useState(false);
  const [showApproved, setShowApproved] = useState(true);

  const [knowledgeType, setKnowledgeType] = useState<KnowledgeType>("exclusion_rule");
  const [knowledgeContent, setKnowledgeContent] = useState("");
  const [addingKnowledge, setAddingKnowledge] = useState(false);

  const [newCompetitorDomain, setNewCompetitorDomain] = useState("");

  useEffect(() => {
    if (!business) return;
    const unsubs = [
      listenBusinessKnowledge(business.id, setKnowledge),
      listenSearchTopics(business.id, setTopics),
      listenCompetitors(business.id, setCompetitors),
      listenBusinessServices(business.id, setServices)
    ];
    return () => unsubs.forEach((u) => u());
  }, [business]);

  if (!business) return <div className="loading-row">טוען…</div>;

  async function runDiscovery(source: "gsc" | "semrush", paidNewRun = false) {
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
        result = paidNewRun
          ? await discoverFromSemrushNewPaidRun(business.id, semrushSeed.trim())
          : await discoverFromSemrush(business.id, semrushSeed.trim());
      }
      setLastResult({ source, result });
    } catch (err) {
      setDiscoveryError(err instanceof Error ? err.message : "שגיאה בגילוי");
    } finally {
      setRunningSource(null);
      if (source === "semrush") dispatchSemrush({ type: "finished" });
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
  // Topics created by the retired website scan (website words used directly
  // as search topics - replaced by the Service Map in M3.1). Website =
  // evidence, never the Search Universe.
  const legacyWebsiteTopics = reviewTopics.filter((t) => t.source === "website");
  const approvedTopics = (topics || []).filter((t) => APPROVED_STATUSES.includes(t.status));
  const confirmedServices = (services || []).filter((s) => s.ownerStatus === "confirmed");

  return (
    <div className="section-block">
      <h2 className="section-title" style={{ fontSize: "1.3rem" }}>הבנת העסק ונושאי חיפוש</h2>
      <p className="section-intro">
        קודם המערכת מבינה מה העסק מוכר (מפת שירותים), ורק אחר כך מחפשת מה אנשים מחפשים סביב זה (יקום חיפוש). כל דבר
        שהמערכת מגלה ממתין לאישורך.
      </p>
      <nav className="pipeline" aria-label="שלבי המערכת">
        {PIPELINE.map((step, i) => (
          <span key={step} style={{ display: "contents" }}>
            {i > 0 && <span className="pipeline-arrow" aria-hidden="true">←</span>}
            <span className={`pipeline-step ${CURRENT_STEPS.has(step) ? "current" : ""}`} aria-current={CURRENT_STEPS.has(step) ? "step" : undefined}>
              {step}
            </span>
          </span>
        ))}
      </nav>

      <ServiceMapSection business={business} services={services} />

      {/* --- Search Universe --- */}
      <section className="subsection">
        <div className="subsection-header">
          <div>
            <h3 className="subsection-title">יקום חיפוש</h3>
            <div className="subsection-sub">נושאי חיפוש שהתגלו, לבדיקה ולאישור. רק נושאים מאושרים ימשיכו לעבודת SEO/GEO בהמשך.</div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-title" style={{ marginBottom: "var(--space-3)" }}>גילוי נושאים</div>
          <div className="panel-row">
            <button type="button" className="btn btn-outline" disabled={runningSource !== null} onClick={() => runDiscovery("gsc")}>
              {runningSource === "gsc" ? "סורק…" : "גילוי מ-Search Console"}
            </button>
            <span className="text-dim" aria-hidden="true">|</span>
            <input
              value={semrushSeed}
              onChange={(e) => setSemrushSeed(e.target.value)}
              placeholder="שירות מאושר / מילת מפתח מקור"
              list="confirmed-services-datalist"
              className="select-quiet"
              style={{ padding: "8px 10px", minWidth: 220 }}
              aria-label="מילת מפתח מקור ל-Semrush"
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
              onClick={() => {
                dispatchSemrush({ type: "start" });
                void runDiscovery("semrush");
              }}
            >
              {runningSource === "semrush" ? "מריץ…" : "גילוי מ-Semrush"}
            </button>
            {lastResult?.source === "semrush" && lastResult.result.cacheHit && (
              <button type="button" className="btn btn-quiet btn-sm" disabled={runningSource !== null} onClick={() => dispatchSemrush({ type: "requestNewRun" })}>
                שליפה חדשה (בתשלום)…
              </button>
            )}
          </div>
          {semrushFlow.phase === "confirming" && (
            <ConfirmPaidRunDialog
              providerLabel="Semrush"
              estimateNote="עלות משוערת: עד כ-2,100 יחידות API של Semrush."
              onReuse={() => dispatchSemrush({ type: "cancel" })}
              onConfirmPaid={() => {
                const next = paidRunReducer(semrushFlow, { type: "confirmNewRun" });
                dispatchSemrush({ type: "confirmNewRun" });
                void runDiscovery("semrush", runIsForced(next));
              }}
              onClose={() => dispatchSemrush({ type: "cancel" })}
            />
          )}
          <p className="panel-meta" style={{ margin: "var(--space-3) 0 0" }}>
            Search Console חינמי ומשקף נראות קיימת בגוגל. Semrush בתשלום ביחידות API — שליפה זהה תוך 24 שעות חוזרת מהמטמון
            ללא עלות. ל-Semrush מומלץ להזין שירות מאושר ממפת השירותים. Semrush יחזיר שגיאה
            ברורה עד שיוגדר מפתח API עם יחידות.
          </p>
          {discoveryError && <div className="login-error" style={{ marginTop: "var(--space-3)", marginBottom: 0 }}>{discoveryError}</div>}
          {lastResult && (
            <div style={{ marginTop: "var(--space-3)" }}>
              <strong style={{ fontSize: "0.88rem" }}>
                {DISCOVERY_SOURCE_LABELS[lastResult.source as keyof typeof DISCOVERY_SOURCE_LABELS] || lastResult.source}
              </strong>
              <DiscoveryResultSummary result={lastResult.result} />
            </div>
          )}
        </div>

        <div className="summary-bar" style={{ marginTop: "var(--space-4)" }}>
          <span className="summary-chip" style={{ cursor: "default" }}><strong>{reviewTopics.length}</strong>ממתינים לבדיקה</span>
          <span className="summary-chip" style={{ cursor: "default" }}><strong>{approvedTopics.length}</strong>מאושרים</span>
        </div>

        <h4 className="panel-title" style={{ margin: "var(--space-4) 0 var(--space-3)" }}>לבדיקה</h4>
        {legacyWebsiteTopics.length > 0 && (
          <div className="panel tone-warn">
            <div className="panel-row" style={{ justifyContent: "space-between" }}>
              <div>
                <div className="panel-title">{legacyWebsiteTopics.length} נושאים מסריקת האתר הישנה (הוצאה משימוש)</div>
                <div className="panel-meta">
                  הם נוצרו ישירות ממילים באתר, לפני שהאתר הפך לעדות למפת השירותים בלבד. אפשר לסמן את כולם כ״הוחרג״ - הפעולה
                  הפיכה, דרך הסטטוס של כל נושא.
                </div>
              </div>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => Promise.all(legacyWebsiteTopics.map((t) => updateSearchTopicStatus(t.id, "exclude")))}
              >
                סימון כולם כ״הוחרג״
              </button>
            </div>
          </div>
        )}
        {topics === null && <div className="loading-row">טוען…</div>}
        {topics !== null && reviewTopics.length === 0 && (
          <EmptyState title="אין נושאים לבדיקה" subtitle="הרץ/י גילוי למעלה, או הוסף/י נושא ידנית." />
        )}
        <div className="record-list">
          {reviewTopics.map((t) => (
            <SearchTopicCard key={t.id} topic={t} />
          ))}
        </div>

        <form onSubmit={handleAddTopic} className="panel add-form" style={{ marginTop: "var(--space-4)" }}>
          <div className="form-field">
            <label htmlFor="topic-title">הוספת נושא ידנית</label>
            <input id="topic-title" value={newTopicTitle} onChange={(e) => setNewTopicTitle(e.target.value)} placeholder="כותרת / מילת חיפוש" />
          </div>
          <div className="form-field">
            <label htmlFor="topic-notes">הערות (אופציונלי)</label>
            <input id="topic-notes" value={newTopicNotes} onChange={(e) => setNewTopicNotes(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-outline" disabled={addingTopic || !newTopicTitle.trim()}>
            {addingTopic ? "מוסיף…" : "+ הוספה"}
          </button>
        </form>

        <button
          type="button"
          className="disclosure"
          aria-expanded={showApproved}
          onClick={() => setShowApproved((v) => !v)}
          style={{ marginTop: "var(--space-5)", fontSize: "0.95rem" }}
        >
          יקום חיפוש מאושר ({approvedTopics.length}) <span className="chev" aria-hidden="true">▾</span>
        </button>
        {showApproved && (
          <div style={{ marginTop: "var(--space-3)" }}>
            {topics !== null && approvedTopics.length === 0 && (
              <EmptyState title="אין עדיין נושאים מאושרים" subtitle="נושאים שיסומנו רלוונטי / עדיפות / מותג-אסטרטגי יופיעו כאן." />
            )}
            <div className="record-list">
              {approvedTopics.map((t) => (
                <SearchTopicCard key={t.id} topic={t} />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* --- Competitors (tabular: compared side by side) --- */}
      <section className="subsection">
        <div className="subsection-header">
          <div>
            <h3 className="subsection-title">מתחרים</h3>
            <div className="subsection-sub">מתחרים שזוהו ב-Semrush או נוספו ידנית.</div>
          </div>
        </div>
        {competitors !== null && competitors.length === 0 && (
          <EmptyState title="אין עדיין מתחרים" subtitle="גילוי Semrush יזהה מתחרים אוטומטית לאחר שיוגדר מפתח API." />
        )}
        {competitors && competitors.length > 0 && (
          <div className="data-table-wrap">
            <table className="data-table compact-table">
              <thead>
                <tr>
                  <th>דומיין</th>
                  <th>רלוונטיות</th>
                  <th>מילות מפתח משותפות</th>
                  <th>זוהה באמצעות</th>
                  <th><span className="visually-hidden">פעולות</span></th>
                </tr>
              </thead>
              <tbody>
                {competitors.map((c) => (
                  <tr key={c.id}>
                    <td><span className="url-text">{c.domain}</span></td>
                    <td className="text-muted">{c.relevanceScore ?? "—"}</td>
                    <td className="text-muted">{c.sharedKeywordCount ?? "—"}</td>
                    <td>
                      {c.discoveredVia === "manual" ? <Badge tone="accent" icon="●">ידני</Badge> : <Badge tone="outline">Semrush</Badge>}
                    </td>
                    <td style={{ textAlign: "end" }}>
                      <ConfirmDeleteButton onConfirm={() => deleteCompetitor(c.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form onSubmit={handleAddCompetitor} className="panel add-form" style={{ marginTop: "var(--space-4)", gridTemplateColumns: "1fr auto" }}>
          <div className="form-field">
            <label htmlFor="competitor-domain">הוספת מתחרה ידנית</label>
            <input id="competitor-domain" dir="ltr" value={newCompetitorDomain} onChange={(e) => setNewCompetitorDomain(e.target.value)} placeholder="example.com" />
          </div>
          <button type="submit" className="btn btn-outline" disabled={!newCompetitorDomain.trim()}>+ הוספה</button>
        </form>
      </section>

      {/* --- Business knowledge --- */}
      <section className="subsection">
        <div className="subsection-header">
          <div>
            <h3 className="subsection-title">מה המערכת יודעת על העסק</h3>
            <div className="subsection-sub">כללים והעדפות שלך. כללי החרגה מסננים אוטומטית מועמדים עתידיים בגילוי.</div>
          </div>
        </div>
        {knowledge !== null && knowledge.length === 0 && (
          <EmptyState title="אין עדיין רשומות ידע" subtitle="הוסף/י כלל החרגה, עדיפות אסטרטגית, מינוח מותג או כלל עסקי." />
        )}
        {knowledge && knowledge.length > 0 && (
          <div className="data-table-wrap">
            <table className="data-table compact-table">
              <thead>
                <tr>
                  <th>סוג</th>
                  <th>תוכן</th>
                  <th>מקור</th>
                  <th>נוסף</th>
                  <th><span className="visually-hidden">פעולות</span></th>
                </tr>
              </thead>
              <tbody>
                {knowledge.map((k) => (
                  <tr key={k.id}>
                    <td className="text-muted">{KNOWLEDGE_TYPE_LABELS[k.type]}</td>
                    <td>{k.content}</td>
                    <td>
                      {k.source === "owner" ? (
                        <Badge tone="accent" icon="●">בעל/ת העסק</Badge>
                      ) : (
                        <Badge tone="outline" icon="~">הסקת מערכת</Badge>
                      )}
                    </td>
                    <td className="text-muted">{formatDate(k.createdAt)}</td>
                    <td style={{ textAlign: "end" }}>
                      <ConfirmDeleteButton onConfirm={() => deleteBusinessKnowledge(k.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form onSubmit={handleAddKnowledge} className="panel add-form" style={{ marginTop: "var(--space-4)" }}>
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
          <button type="submit" className="btn btn-outline" disabled={addingKnowledge || !knowledgeContent.trim()}>
            {addingKnowledge ? "מוסיף…" : "+ הוספה"}
          </button>
        </form>
      </section>
    </div>
  );
}
