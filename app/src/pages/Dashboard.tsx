import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { StatCard } from "../components/StatCard";
import { EmptyState } from "../components/EmptyState";
import { AddBusinessModal } from "../components/AddBusinessModal";
import {
  listenBusinesses,
  listenAllTasksAcrossBusinesses,
  listenAllOpportunitiesAcrossBusinesses,
  listenAllIntegrations
} from "../lib/firestore";
import type { Business, Task, Opportunity, Integration } from "../types";

export default function Dashboard() {
  const [businesses, setBusinesses] = useState<Business[] | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[] | null>(null);
  const [integrations, setIntegrations] = useState<Integration[] | null>(null);
  const [showAddBusiness, setShowAddBusiness] = useState(false);

  useEffect(() => {
    const unsub1 = listenBusinesses(setBusinesses);
    const unsub2 = listenAllTasksAcrossBusinesses(setTasks);
    const unsub3 = listenAllOpportunitiesAcrossBusinesses(setOpportunities);
    const unsub4 = listenAllIntegrations(setIntegrations);
    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
    };
  }, []);

  const nextBusinessNumber = useMemo(() => {
    if (!businesses || businesses.length === 0) return 1;
    return Math.max(...businesses.map((b) => b.businessNumber || 0)) + 1;
  }, [businesses]);

  const businessStats = useMemo(() => {
    if (!businesses) return null;
    return {
      total: businesses.length,
      active: businesses.filter((b) => b.status === "active").length,
      needsAttention: businesses.filter((b) => b.status === "onboarding").length
    };
  }, [businesses]);

  const taskStats = useMemo(() => {
    if (!tasks) return null;
    return {
      open: tasks.filter((t) => t.status === "todo" || t.status === "in_progress").length,
      highPriority: tasks.filter((t) => t.priority === "high" && t.status !== "completed" && t.status !== "cancelled").length,
      waitingForHuman: tasks.filter((t) => t.status === "waiting_for_human").length
    };
  }, [tasks]);

  const oppStats = useMemo(() => {
    if (!opportunities) return null;
    return {
      total: opportunities.length,
      highPriority: opportunities.filter((o) => o.priority === "high").length,
      newCount: opportunities.filter((o) => o.status === "new").length,
      inProgress: opportunities.filter((o) => o.status === "in_progress").length,
      completed: opportunities.filter((o) => o.status === "completed").length
    };
  }, [opportunities]);

  const integrationStats = useMemo(() => {
    if (!integrations) return { connected: 0, pending: 0, error: 0 };
    return {
      connected: integrations.filter((i) => i.status === "connected").length,
      pending: integrations.filter((i) => i.status === "not_connected" || i.status === "auth_required").length,
      error: integrations.filter((i) => i.status === "error").length
    };
  }, [integrations]);

  return (
    <AppShell>
      <div className="app-main-header">
        <div>
          <h1 className="app-main-title">Visibility OS Dashboard</h1>
          <div className="app-main-subtitle">מצב המערכת על כל העסקים</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddBusiness(true)}>
          + עסק חדש
        </button>
      </div>

      <div className="section-block">
        <h2 className="section-title">עסקים</h2>
        <div className="stat-grid">
          <StatCard label="סה״כ עסקים" value={businessStats ? businessStats.total : "…"} />
          <StatCard label="עסקים פעילים" value={businessStats ? businessStats.active : "…"} />
          <StatCard label="דורשים תשומת לב" value={businessStats ? businessStats.needsAttention : "…"} />
        </div>
      </div>

      <div className="section-block">
        <h2 className="section-title">חיפוש (Search)</h2>
        <EmptyState
          title="לא מחובר"
          subtitle="נתוני Search Console יופיעו כאן לאחר שהאינטגרציה תחובר לעסק (Milestone 2)."
        />
      </div>

      <div className="section-block">
        <h2 className="section-title">תנועה (Traffic)</h2>
        <EmptyState
          title="לא מחובר"
          subtitle="נתוני Google Analytics 4 יופיעו כאן לאחר שהאינטגרציה תחובר לעסק (Milestone 2)."
        />
      </div>

      <div className="section-block">
        <h2 className="section-title">הזדמנויות (Opportunities)</h2>
        <div className="stat-grid">
          <StatCard label="סה״כ" value={oppStats ? oppStats.total : "…"} />
          <StatCard label="עדיפות גבוהה" value={oppStats ? oppStats.highPriority : "…"} />
          <StatCard label="חדשות" value={oppStats ? oppStats.newCount : "…"} />
          <StatCard label="בתהליך" value={oppStats ? oppStats.inProgress : "…"} />
          <StatCard label="הושלמו" value={oppStats ? oppStats.completed : "…"} />
        </div>
      </div>

      <div className="section-block">
        <h2 className="section-title">משימות (Tasks)</h2>
        <div className="stat-grid">
          <StatCard label="פתוחות" value={taskStats ? taskStats.open : "…"} />
          <StatCard label="עדיפות גבוהה" value={taskStats ? taskStats.highPriority : "…"} />
          <StatCard label="ממתינות לאדם" value={taskStats ? taskStats.waitingForHuman : "…"} />
        </div>
      </div>

      <div className="section-block">
        <h2 className="section-title">אינטגרציות</h2>
        <div className="stat-grid">
          <StatCard label="מחוברות" value={integrationStats.connected} />
          <StatCard label="ממתינות" value={integrationStats.pending} dim />
          <StatCard label="שגיאה" value={integrationStats.error} />
        </div>
      </div>

      <div className="section-block">
        <h2 className="section-title">עסקים</h2>
        {businesses === null && <div className="loading-row">טוען…</div>}
        {businesses && businesses.length === 0 && (
          <EmptyState
            title="אין עדיין עסקים במערכת"
            subtitle="צור את העסק הראשון (Business 001) כדי להתחיל."
            action={
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddBusiness(true)}>
                + עסק חדש
              </button>
            }
          />
        )}
        {businesses && businesses.length > 0 && (
          <div className="business-grid">
            {businesses.map((b) => (
              <Link key={b.id} to={`/business/${b.id}`} className="business-card">
                <div className="business-card-name">
                  Business {String(b.businessNumber).padStart(3, "0")} — {b.name}
                </div>
                <div className="business-card-meta">
                  {b.industry || "—"} · {b.primaryMarket || "—"}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {showAddBusiness && (
        <AddBusinessModal
          nextBusinessNumber={nextBusinessNumber}
          onClose={() => setShowAddBusiness(false)}
          onCreated={() => setShowAddBusiness(false)}
        />
      )}
    </AppShell>
  );
}
