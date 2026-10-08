import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { listenLatestIntelligenceRun, listenBaselines, listenSearchTopics, listenBusinessServices } from "../../lib/firestore";
import { when } from "../../lib/plainLanguage";
import type { Baseline, BusinessService, IntelligenceRun, SearchTopic } from "../../types";
import type { BusinessContext } from "./BusinessWorkspace";

// סקירה - the business at a glance: where things stand and where to go next.
// Read-only (Firestore listeners); no function calls. The baseline action
// lives in מודיעין חיפוש → בייסליין (same behaviour as before).

function Card({ title, value, sub, to, cta }: { title: string; value: string; sub: string; to: string; cta: string }) {
  return (
    <div className="overview-card">
      <div className="overview-card-title">{title}</div>
      <div className="overview-card-value">{value}</div>
      <div className="overview-card-sub">{sub}</div>
      <Link className="btn btn-quiet btn-sm" to={to}>{cta} ←</Link>
    </div>
  );
}

export default function BusinessOverview() {
  const { business } = useOutletContext<BusinessContext>();
  const [run, setRun] = useState<IntelligenceRun | null>(null);
  const [baselines, setBaselines] = useState<Baseline[] | null>(null);
  const [topics, setTopics] = useState<SearchTopic[] | null>(null);
  const [services, setServices] = useState<BusinessService[] | null>(null);

  useEffect(() => {
    if (!business) return;
    const unsubs = [
      listenLatestIntelligenceRun(business.id, setRun),
      listenBaselines(business.id, setBaselines),
      listenSearchTopics(business.id, setTopics),
      listenBusinessServices(business.id, setServices)
    ];
    return () => unsubs.forEach((u) => u());
  }, [business]);

  if (!business) return <div className="loading-row">טוען…</div>;

  const approved = (topics || []).filter((t) => ["relevant", "priority", "brand_strategic"].includes(t.status)).length;
  const toReview = (topics || []).filter((t) => t.status === "new" || t.status === "unsure").length;
  const servicesToReview = (services || []).filter((s) => s.ownerStatus === "needs_review").length;
  const confirmedServices = (services || []).filter((s) => s.ownerStatus === "confirmed").length;
  const latest = baselines?.[0];
  const s = run?.summary;

  return (
    <div className="section-block">
      <header className="page-head">
        <div>
          <h2 className="page-title">סקירה</h2>
          <div className="page-meta">{business.website || "לא הוגדר אתר"}</div>
        </div>
        <Link className="btn btn-primary" to="intelligence">מעבר למודיעין חיפוש</Link>
      </header>

      <div className="overview-grid">
        <Card
          title="מודיעין חיפוש"
          value={s ? `${s.topicsWithGscVisibility}/${s.approvedTopics}` : "—"}
          sub={s ? `נושאים מאושרים שמופיעים בגוגל · ${s.pagesAnalyzed} דפים נבדקו · ניתוח אחרון ${when(run?.completedAtMs)}` : "עדיין לא הורץ ניתוח"}
          to="intelligence"
          cta="לתמונת המצב"
        />
        <Card
          title="נושאי חיפוש"
          value={topics ? String(approved) : "—"}
          sub={topics ? `נושאים מאושרים · ${toReview} ממתינים לבדיקה שלך` : "טוען…"}
          to="topics"
          cta="לנושאי החיפוש"
        />
        <Card
          title="שירותי העסק"
          value={services ? String(confirmedServices) : "—"}
          sub={services ? `שירותים מאושרים · ${servicesToReview} ממתינים לבדיקה` : "טוען…"}
          to="topics"
          cta="למפת השירותים"
        />
        <Card
          title="בייסליין"
          value={latest ? `גרסה ${latest.version}` : "—"}
          sub={latest ? `נשמר ${when(latest.capturedAtMs)}` : "עדיין לא נשמר צילום מצב"}
          to="intelligence?tab=baseline"
          cta="לבייסליין"
        />
      </div>

      <div className="panel" style={{ marginTop: "var(--space-6)" }}>
        <div className="panel-title">איך זה עובד</div>
        <ol className="steps-list">
          <li><strong>נושאי חיפוש</strong> - מאשרים מה העסק מוכר ועל מה רוצים שימצאו אותו.</li>
          <li><strong>מודיעין חיפוש</strong> - המערכת בודקת את האתר ואת הנראות בגוגל לכל נושא מאושר.</li>
          <li><strong>בייסליין</strong> - שומרים צילום מצב לפני שינויים, כדי שאפשר יהיה למדוד אחר כך.</li>
        </ol>
      </div>
    </div>
  );
}
