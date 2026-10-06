import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { EmptyState } from "../../components/EmptyState";
import { updateBusiness } from "../../lib/firestore";
import type { BusinessContext } from "./BusinessWorkspace";

export default function BusinessOverview() {
  const { business } = useOutletContext<BusinessContext>();
  const [settingBaseline, setSettingBaseline] = useState(false);
  const [baselineError, setBaselineError] = useState<string | null>(null);

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
    ["יעדי המרה עיקריים", business.primaryConversionGoals]
  ];

  async function handleSetBaseline() {
    setSettingBaseline(true);
    setBaselineError(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await updateBusiness(business!.id, { baselineDate: today });
    } catch (err) {
      setBaselineError(err instanceof Error ? err.message : "שגיאה בקביעת הבייסליין");
    } finally {
      setSettingBaseline(false);
    }
  }

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
        <h2 className="section-title">בייסליין</h2>
        {baselineError && <div className="login-error">{baselineError}</div>}
        <p className="text-muted" style={{ marginBottom: 12, fontSize: "0.88rem" }}>
          תאריך הבייסליין הוא נקודת הייחוס להשוואות בלשוניות תנועה וחיפוש - הנתון הקרוב ביותר לתאריך זה משמש כבסיס
          ל"שינוי מאז הבייסליין".
          {" "}
          {business.baselineDate ? `נקבע ל-${business.baselineDate}.` : "טרם נקבע."}
        </p>
        <button type="button" className="btn btn-outline" disabled={settingBaseline} onClick={handleSetBaseline}>
          {settingBaseline ? "קובע…" : business.baselineDate ? "עדכן בייסליין להיום" : "קבע בייסליין להיום"}
        </button>
      </div>

      <div className="section-block">
        <h2 className="section-title">ביצועי חיפוש ותנועה</h2>
        <EmptyState
          title="ראו את הפירוט המלא בלשוניות"
          subtitle='נתוני Google Analytics 4 ו-Search Console, כולל מגמות והשוואה לבייסליין, מוצגים בלשוניות "תנועה" ו"חיפוש".'
        />
      </div>
    </div>
  );
}
