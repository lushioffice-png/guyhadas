import { useOutletContext } from "react-router-dom";
import { EmptyState } from "../../components/EmptyState";
import type { BusinessContext } from "./BusinessWorkspace";

export default function BusinessOverview() {
  const { business } = useOutletContext<BusinessContext>();

  if (!business) {
    return <div className="loading-row">טוען…</div>;
  }

  const profileRows: [string, string | undefined][] = [
    ["אתר", business.website],
    ["תחום", business.industry],
    ["תיאור", business.description],
    ["שוק עיקרי", business.primaryMarket],
    ["אזורים גיאוגרפיים", business.geographicMarkets?.join(", ")],
    ["קהל יעד", business.targetAudience],
    ["שירותים", business.services?.join(", ")],
    ["יעדים עסקיים", business.businessObjectives],
    ["יעדי המרה עיקריים", business.primaryConversionGoals],
    ["תאריך בייסליין", business.baselineDate || "טרם נקבע"]
  ];

  return (
    <div>
      <div className="section-block">
        <h2 className="section-title">פרופיל עסק</h2>
        <div className="data-table-wrap">
          <table className="data-table">
            <tbody>
              {profileRows.map(([label, value]) => (
                <tr key={label}>
                  <th style={{ width: 200 }}>{label}</th>
                  <td>{value || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section-block">
        <h2 className="section-title">ביצועי חיפוש ותנועה</h2>
        <EmptyState
          title="אין עדיין נתונים"
          subtitle="לאחר חיבור Google Analytics 4 ו-Search Console (Milestone 2), ביצועי חיפוש ותנועה עדכניים יוצגו כאן."
        />
      </div>
    </div>
  );
}
