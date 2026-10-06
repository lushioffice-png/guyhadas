import { useEffect, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router-dom";
import { EmptyState } from "../../components/EmptyState";
import {
  listenBusinessKnowledge,
  createBusinessKnowledge,
  deleteBusinessKnowledge,
  listenSearchTopics,
  updateSearchTopicStatus,
  createManualTopic,
  listenCompetitors,
  addManualCompetitor,
  deleteCompetitor
} from "../../lib/firestore";
import { discoverFromSearchConsole, discoverFromWebsite, discoverFromSemrush } from "../../lib/functions";
import type { DiscoveryResult } from "../../lib/functions";
import {
  TOPIC_STATUS_LABELS,
  KNOWLEDGE_TYPE_LABELS,
  DISCOVERY_SOURCE_LABELS
} from "../../types";
import type { BusinessKnowledge, SearchTopic, TopicStatus, KnowledgeType, Competitor } from "../../types";
import type { BusinessContext } from "./BusinessWorkspace";

// Search Universe & Qualification (roadmap Milestone 3). This tab covers
// the whole owner-facing loop: Discovery (3 trigger buttons below, each a
// Cloud Function in functions/searchUniverse.js) → Filtering + Normalization
// (automatic, server-side, happens inside those same calls) → Owner
// Validation (the review queue and status selects below, plain Firestore
// writes) → Approved Search Universe (the second table). Per the roadmap's
// explicit instruction, this tab stops there - no SEO/GEO task generation
// happens from anything here yet.

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
    </span>
  );
}

export default function BusinessTopics() {
  const { business } = useOutletContext<BusinessContext>();
  const [knowledge, setKnowledge] = useState<BusinessKnowledge[] | null>(null);
  const [topics, setTopics] = useState<SearchTopic[] | null>(null);
  const [competitors, setCompetitors] = useState<Competitor[] | null>(null);

  const [runningSource, setRunningSource] = useState<string | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ source: string; result: DiscoveryResult } | null>(null);
  const [semrushSeed, setSemrushSeed] = useState("");

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
    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, [business]);

  if (!business) return <div className="loading-row">טוען…</div>;

  async function runDiscovery(source: "gsc" | "website" | "semrush") {
    if (!business) return;
    setRunningSource(source);
    setDiscoveryError(null);
    try {
      let result: DiscoveryResult;
      if (source === "gsc") result = await discoverFromSearchConsole(business.id);
      else if (source === "website") result = await discoverFromWebsite(business.id);
      else {
        if (!semrushSeed.trim()) {
          setDiscoveryError("יש להזין מילת מפתח מקור (seed phrase) להרצת Semrush");
          setRunningSource(null);
          return;
        }
        result = await discoverFromSemrush(business.id, semrushSeed.trim());
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

  return (
    <div className="section-block">
      <h2 className="section-title">נושאי חיפוש</h2>
      <p className="text-dim" style={{ fontSize: "0.82rem", marginTop: -8, marginBottom: 20 }}>
        Discovery → Filtering → Normalization → Owner Validation → Approved Search Universe. יצירת משימות SEO/GEO
        מתוך הנושאים המאושרים מתוכננת לשלב הבא.
      </p>

      {/* --- Discovery --- */}
      <div className="table-toolbar" style={{ marginBottom: 12 }}>
        <h3 className="section-title" style={{ marginBottom: 0, fontSize: "1rem" }}>גילוי</h3>
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
        <button
          type="button"
          className="btn btn-outline"
          disabled={runningSource !== null}
          onClick={() => runDiscovery("website")}
        >
          {runningSource === "website" ? "סורק…" : "סריקת אתר קלה"}
        </button>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            value={semrushSeed}
            onChange={(e) => setSemrushSeed(e.target.value)}
            placeholder="מילת מפתח מקור ל-Semrush"
            style={{
              background: "var(--color-bg)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: "0.82rem",
              width: 200
            }}
          />
          <button
            type="button"
            className="btn btn-outline"
            disabled={runningSource !== null}
            onClick={() => runDiscovery("semrush")}
          >
            {runningSource === "semrush" ? "מריץ…" : "גילוי מ-Semrush"}
          </button>
        </div>
      </div>
      <p className="text-dim" style={{ fontSize: "0.78rem", marginBottom: 12 }}>
        Semrush ממתין להקצאת יחידות API בחשבון הקיים - ההרצה תחזיר שגיאה ברורה עד שייוגדר מפתח API אמיתי.
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
