import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { EmptyState } from "../../components/EmptyState";
import { SubTabs, useSubTab } from "../../components/ui/SubTabs";
import { listenTopicIntelligence, listenSeoPages, listenLatestIntelligenceRun, listenBaselines } from "../../lib/firestore";
import { runSearchIntelligence, captureBaseline, governedDetails } from "../../lib/functions";
import { DECISION_TEXT, needsAttention, when } from "../../lib/plainLanguage";
import type { Baseline, IntelligenceRun, SeoPage, TopicIntelligence } from "../../types";
import type { BusinessContext } from "./BusinessWorkspace";
import { SnapshotTab } from "./intelligence/SnapshotTab";
import { TopicsTab } from "./intelligence/TopicsTab";
import { TechnicalTab } from "./intelligence/TechnicalTab";
import { GeoTab } from "./intelligence/GeoTab";
import { BaselineTab } from "./intelligence/BaselineTab";

// מודיעין חיפוש (M4 data, issue #23 presentation). Header with the one
// primary action, then local tabs. All data comes from Firestore listeners;
// the only function calls are the two explicit buttons (run analysis, save
// baseline) - nothing runs on render. Backend behaviour is unchanged.

export default function BusinessIntelligence() {
  const { business } = useOutletContext<BusinessContext>();
  const [topics, setTopics] = useState<TopicIntelligence[] | null>(null);
  const [pages, setPages] = useState<SeoPage[] | null>(null);
  const [run, setRun] = useState<IntelligenceRun | null>(null);
  const [runLoaded, setRunLoaded] = useState(false);
  const [baselines, setBaselines] = useState<Baseline[] | null>(null);
  const [busy, setBusy] = useState<"run" | "baseline" | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!business) return;
    const unsubs = [
      listenTopicIntelligence(business.id, setTopics),
      listenSeoPages(business.id, setPages),
      listenLatestIntelligenceRun(business.id, (r) => {
        setRun(r);
        setRunLoaded(true);
      }),
      listenBaselines(business.id, setBaselines)
    ];
    return () => unsubs.forEach((u) => u());
  }, [business]);

  const attentionCount = (pages || []).filter((p) => p.crawlStatus === "fetched" && needsAttention(p)).length;
  const geoGaps = (run?.geoReadiness?.signals || []).filter((g) => g.status === "missing" || g.status === "partial").length;
  const tabs = [
    { id: "snapshot", label: "תמונת מצב" },
    { id: "topics", label: "נושאי חיפוש", count: topics ? topics.length : null },
    { id: "technical", label: "SEO טכני", count: attentionCount || null },
    { id: "geo", label: "GEO", count: geoGaps || null },
    { id: "baseline", label: "בייסליין" }
  ];
  const [tab, setTab] = useSubTab(tabs, "snapshot");

  if (!business) return <div className="loading-row">טוען…</div>;

  async function doRun() {
    setBusy("run");
    setNotice(null);
    try {
      const r = await runSearchIntelligence(business!.id);
      const blocked = r.gsc.blockedReason ? ` נתוני גוגל לא עודכנו: ${DECISION_TEXT[r.gsc.blockedReason] || r.gsc.blockedReason}.` : "";
      setNotice({ kind: "ok", text: `הניתוח הושלם.${blocked}` });
    } catch (err) {
      const d = governedDetails(err);
      setNotice({ kind: "error", text: `${d?.blockedReason ? (DECISION_TEXT[d.blockedReason] || d.blockedReason) + ". " : ""}${err instanceof Error ? err.message : "הניתוח נכשל"}` });
    } finally {
      setBusy(null);
    }
  }

  async function doBaseline() {
    setBusy("baseline");
    setNotice(null);
    try {
      const b = await captureBaseline(business!.id);
      setNotice({ kind: "ok", text: `נשמר בייסליין גרסה ${b.version}. גרסאות קודמות לא שונו.` });
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "שמירת הבייסליין נכשלה" });
    } finally {
      setBusy(null);
    }
  }

  const loading = !runLoaded || topics === null || pages === null || baselines === null;

  return (
    <div className="section-block">
      <header className="page-head">
        <div>
          <h2 className="page-title">מודיעין חיפוש</h2>
          <div className="page-meta">
            {run ? `ניתוח אחרון: ${when(run.completedAtMs)}` : runLoaded ? "עדיין לא הורץ ניתוח" : "טוען…"}
          </div>
        </div>
        <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={doRun}>
          {busy === "run" ? "מנתח… (עד כדקה)" : run ? "הרצת ניתוח מחדש" : "הרצת ניתוח"}
        </button>
      </header>
      {notice && <div className={notice.kind === "error" ? "login-error" : "notice-ok"}>{notice.text}</div>}

      {loading ? (
        <div className="loading-row">טוען…</div>
      ) : (
        <>
          <SubTabs tabs={tabs} current={tab} onSelect={setTab} label="אזורי מודיעין החיפוש" />
          <div className="subtab-panel" role="tabpanel">
            {!run && tab !== "baseline" && (
              <EmptyState
                title="עדיין אין ניתוח"
                subtitle="הניתוח בודק את דפי האתר ואת הנראות בגוגל של הנושאים שאישרת. לוחצים על ״הרצת ניתוח״ למעלה."
              />
            )}
            {run && tab === "snapshot" && <SnapshotTab run={run} topics={topics!} pages={pages!} onOpen={setTab} />}
            {run && tab === "topics" && <TopicsTab topics={topics!} />}
            {run && tab === "technical" && <TechnicalTab pages={pages!} />}
            {run && tab === "geo" && <GeoTab run={run} />}
            {tab === "baseline" && <BaselineTab baselines={baselines!} onCapture={doBaseline} busy={busy !== null} />}
          </div>
        </>
      )}
    </div>
  );
}
