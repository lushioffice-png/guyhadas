import { useEffect, useState, type FormEvent } from "react";
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
  deleteCompetitor,
  listenRuleExcludedKeywords
} from "../../lib/firestore";
import { KNOWLEDGE_TYPE_LABELS } from "../../types";
import type { BusinessKnowledge, SearchTopic, TopicStatus, KnowledgeType, Competitor, BusinessService, Keyword } from "../../types";
import type { BusinessContext } from "./BusinessWorkspace";
import { updateSearchTopicStatus } from "../../lib/firestore";
import { ConfirmDeleteButton } from "../../components/review/ConfirmDeleteButton";
import { Badge } from "../../components/review/Badge";
import { ServiceMapSection } from "./topics/ServiceMapSection";
import { SearchTopicCard } from "./topics/SearchTopicCard";
import { SeedDiscoveryPanel } from "./topics/SeedDiscoveryPanel";

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


function formatDate(value: unknown): string {
  const ts = value as { toDate?: () => Date } | null | undefined;
  if (!ts?.toDate) return "—";
  return ts.toDate().toLocaleDateString("he-IL", { dateStyle: "short" });
}

export default function BusinessTopics() {
  const { business } = useOutletContext<BusinessContext>();
  const [knowledge, setKnowledge] = useState<BusinessKnowledge[] | null>(null);
  const [services, setServices] = useState<BusinessService[] | null>(null);
  const [topics, setTopics] = useState<SearchTopic[] | null>(null);
  const [competitors, setCompetitors] = useState<Competitor[] | null>(null);

  const [ruleExcluded, setRuleExcluded] = useState<Keyword[] | null>(null);
  const [showExcluded, setShowExcluded] = useState(false);

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
      listenBusinessServices(business.id, setServices),
      listenRuleExcludedKeywords(business.id, setRuleExcluded)
    ];
    return () => unsubs.forEach((u) => u());
  }, [business]);

  if (!business) return <div className="loading-row">טוען…</div>;

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
  const excludedTopics = (topics || []).filter((t) => t.status === "exclude");
  const confirmedServices = (services || []).filter((s) => s.ownerStatus === "confirmed");

  return (
    <div className="section-block">
      <h2 className="section-title" style={{ fontSize: "1.3rem" }}>הבנת העסק ונושאי חיפוש</h2>
      <p className="section-intro">
        קודם המערכת מבינה מה העסק מוכר (מפת שירותים), ורק אחר כך מחפשת מה אנשים מחפשים סביב זה (יקום חיפוש). כל דבר
        שהמערכת מגלה ממתין לאישורך.
      </p>

      <ServiceMapSection business={business} services={services} />

      {/* --- Search Universe --- */}
      <section className="subsection">
        <div className="subsection-header">
          <div>
            <h3 className="subsection-title">יקום חיפוש</h3>
            <div className="subsection-sub">נושאי חיפוש שהתגלו, לבדיקה ולאישור. רק נושאים מאושרים ימשיכו לעבודת SEO/GEO בהמשך.</div>
          </div>
        </div>

        <SeedDiscoveryPanel business={business} confirmedCount={confirmedServices.length} />

        <div className="summary-bar" style={{ marginTop: "var(--space-4)" }}>
          <span className="summary-chip" style={{ cursor: "default" }}><strong>{reviewTopics.length}</strong>ממתינים לבדיקה</span>
          <span className="summary-chip" style={{ cursor: "default" }}><strong>{approvedTopics.length}</strong>מאושרים</span>
          <span className="summary-chip" style={{ cursor: "default" }}><strong>{excludedTopics.length + (ruleExcluded?.length || 0)}</strong>הוחרגו</span>
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

      {/* --- Excluded / rejected: kept as negative signals, never deleted --- */}
      <section className="subsection">
        <button
          type="button"
          className="disclosure"
          aria-expanded={showExcluded}
          onClick={() => setShowExcluded((v) => !v)}
          style={{ fontSize: "0.95rem" }}
        >
          הוחרגו - היסטוריה ({excludedTopics.length} נושאים, {ruleExcluded?.length || 0} שאילתות לפי כלל) <span className="chev" aria-hidden="true">▾</span>
        </button>
        {showExcluded && (
          <div style={{ marginTop: "var(--space-3)" }}>
            <p className="panel-meta" style={{ marginTop: 0 }}>
              נושאים שהחרגת נשארים מוחרגים גם כשגילוי עתידי מוצא אותם שוב. שאילתות שכלל החרגה שלך עצר נשמרות כאן עם הכלל - לא
              נמחקות.
            </p>
            <div className="record-list">
              {excludedTopics.map((t) => (
                <SearchTopicCard key={t.id} topic={t} />
              ))}
            </div>
            {ruleExcluded && ruleExcluded.length > 0 && (
              <ul className="evidence-list">
                {ruleExcluded.map((k) => (
                  <li key={k.id} className="evidence-item" style={{ padding: "6px 12px" }}>
                    <strong>{k.query}</strong> — הוחרג לפי הכלל „{k.excludedByRule?.rule}“
                  </li>
                ))}
              </ul>
            )}
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
