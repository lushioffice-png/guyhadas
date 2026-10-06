import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { StatCard } from "../../components/StatCard";
import { EmptyState } from "../../components/EmptyState";
import { TrendChart } from "../../components/TrendChart";
import { listenTrafficSnapshots } from "../../lib/firestore";
import { findBaselineSnapshot, computeDelta, timestampToMillis } from "../../lib/metrics";
import type { TrafficSnapshot } from "../../types";
import type { BusinessContext } from "./BusinessWorkspace";

export default function BusinessTraffic() {
  const { business } = useOutletContext<BusinessContext>();
  const [snapshots, setSnapshots] = useState<TrafficSnapshot[] | null>(null);

  useEffect(() => {
    if (!business) return;
    return listenTrafficSnapshots(business.id, setSnapshots);
  }, [business]);

  const latest = snapshots && snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  const baselineSnapshot = useMemo(
    () => (business && snapshots ? findBaselineSnapshot(snapshots, business.baselineDate) : null),
    [business, snapshots]
  );

  const sessionsPoints = useMemo(
    () =>
      (snapshots || [])
        .map((s) => ({ x: timestampToMillis(s.retrievedAt), y: s.data.sessions }))
        .filter((p): p is { x: number; y: number } => p.x !== null),
    [snapshots]
  );
  const baselineX = baselineSnapshot ? timestampToMillis(baselineSnapshot.retrievedAt) : null;

  if (!business) return <div className="loading-row">טוען…</div>;

  if (snapshots === null) {
    return <div className="loading-row">טוען…</div>;
  }

  if (!latest) {
    return (
      <div className="section-block">
        <h2 className="section-title">תנועה (Google Analytics 4)</h2>
        <EmptyState
          title="אין עדיין נתונים"
          subtitle="חברו את GA4 בלשונית האינטגרציות כדי להתחיל לראות נתוני תנועה כאן. נתונים היסטוריים ייאספו אוטומטית פעם ביום."
        />
      </div>
    );
  }

  const d = latest.data;

  return (
    <div>
      <div className="section-block">
        <h2 className="section-title">תנועה (Google Analytics 4) · 28 ימים אחרונים</h2>
        <div className="stat-grid">
          <StatCard label="סשנים" value={d.sessions.toLocaleString()} delta={computeDelta(d.sessions, baselineSnapshot?.data.sessions ?? null)} />
          <StatCard
            label="משתמשים"
            value={d.totalUsers.toLocaleString()}
            delta={computeDelta(d.totalUsers, baselineSnapshot?.data.totalUsers ?? null)}
          />
          <StatCard
            label="המרות"
            value={d.conversions.toLocaleString()}
            delta={computeDelta(d.conversions, baselineSnapshot?.data.conversions ?? null)}
          />
          <StatCard label="שיעור מעורבות" value={`${(d.engagementRate * 100).toFixed(1)}%`} />
        </div>
      </div>

      <div className="section-block">
        <h2 className="section-title">מגמת סשנים</h2>
        <div className="chart-card">
          <TrendChart
            points={sessionsPoints}
            color="var(--color-accent)"
            baselineX={baselineX}
            formatValue={(y) => `${Math.round(y).toLocaleString()} סשנים`}
            formatDate={(x) => new Date(x).toLocaleDateString("he-IL", { day: "numeric", month: "short" })}
          />
        </div>
        {sessionsPoints.length < 2 && (
          <p className="text-dim" style={{ fontSize: "0.8rem", marginTop: 8 }}>
            הגרף יתמלא עם הזמן ככל שהסנכרון היומי האוטומטי אוסף יותר נקודות נתון. לחצו "סנכרון עכשיו" באינטגרציות כדי
            להוסיף נקודה נוספת מיידית.
          </p>
        )}
      </div>

      <div className="section-block">
        <h2 className="section-title">פילוח לפי ערוץ</h2>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>ערוץ</th>
                <th>סשנים</th>
              </tr>
            </thead>
            <tbody>
              {d.byChannel.length === 0 && (
                <tr>
                  <td colSpan={2} className="text-muted">
                    אין נתונים
                  </td>
                </tr>
              )}
              {d.byChannel.map((row) => (
                <tr key={row.channel}>
                  <td>{row.channel}</td>
                  <td>{row.sessions.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
