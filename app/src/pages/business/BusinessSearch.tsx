import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { StatCard } from "../../components/StatCard";
import { EmptyState } from "../../components/EmptyState";
import { TrendChart } from "../../components/TrendChart";
import { listenSearchSnapshots } from "../../lib/firestore";
import { findBaselineSnapshot, computeDelta, timestampToMillis } from "../../lib/metrics";
import type { SearchSnapshot } from "../../types";
import type { BusinessContext } from "./BusinessWorkspace";

export default function BusinessSearch() {
  const { business } = useOutletContext<BusinessContext>();
  const [snapshots, setSnapshots] = useState<SearchSnapshot[] | null>(null);

  useEffect(() => {
    if (!business) return;
    return listenSearchSnapshots(business.id, setSnapshots);
  }, [business]);

  const latest = snapshots && snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  const baselineSnapshot = useMemo(
    () => (business && snapshots ? findBaselineSnapshot(snapshots, business.baselineDate) : null),
    [business, snapshots]
  );

  const clicksPoints = useMemo(
    () =>
      (snapshots || [])
        .map((s) => ({ x: timestampToMillis(s.retrievedAt), y: s.data.clicks }))
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
        <h2 className="section-title">חיפוש (Google Search Console)</h2>
        <EmptyState
          title="אין עדיין נתונים"
          subtitle="חברו את Search Console בלשונית האינטגרציות כדי להתחיל לראות נתוני חיפוש כאן. נתונים היסטוריים ייאספו אוטומטית פעם ביום."
        />
      </div>
    );
  }

  const d = latest.data;

  return (
    <div>
      <div className="section-block">
        <h2 className="section-title">חיפוש (Google Search Console) · 28 ימים אחרונים</h2>
        <div className="stat-grid">
          <StatCard label="קליקים" value={d.clicks.toLocaleString()} delta={computeDelta(d.clicks, baselineSnapshot?.data.clicks ?? null)} />
          <StatCard
            label="חשיפות"
            value={d.impressions.toLocaleString()}
            delta={computeDelta(d.impressions, baselineSnapshot?.data.impressions ?? null)}
          />
          <StatCard label="CTR" value={`${(d.ctr * 100).toFixed(1)}%`} />
          <StatCard label="מיקום ממוצע" value={d.avgPosition.toFixed(1)} />
        </div>
      </div>

      <div className="section-block">
        <h2 className="section-title">מגמת קליקים</h2>
        <div className="chart-card">
          <TrendChart
            points={clicksPoints}
            color="var(--color-info)"
            baselineX={baselineX}
            formatValue={(y) => `${Math.round(y).toLocaleString()} קליקים`}
            formatDate={(x) => new Date(x).toLocaleDateString("he-IL", { day: "numeric", month: "short" })}
          />
        </div>
        {clicksPoints.length < 2 && (
          <p className="text-dim" style={{ fontSize: "0.8rem", marginTop: 8 }}>
            הגרף יתמלא עם הזמן ככל שהסנכרון היומי האוטומטי אוסף יותר נקודות נתון. לחצו "סנכרון עכשיו" באינטגרציות כדי
            להוסיף נקודה נוספת מיידית.
          </p>
        )}
      </div>

      <div className="section-block">
        <h2 className="section-title">שאילתות מובילות</h2>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>שאילתה</th>
                <th>קליקים</th>
                <th>חשיפות</th>
                <th>CTR</th>
                <th>מיקום</th>
              </tr>
            </thead>
            <tbody>
              {d.topQueries.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-muted">
                    אין נתונים
                  </td>
                </tr>
              )}
              {d.topQueries.map((row) => (
                <tr key={row.query}>
                  <td>{row.query}</td>
                  <td>{row.clicks.toLocaleString()}</td>
                  <td>{row.impressions.toLocaleString()}</td>
                  <td>{(row.ctr * 100).toFixed(1)}%</td>
                  <td>{row.position.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
