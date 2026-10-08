import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { EmptyState } from "../../components/EmptyState";
import { captureBaseline } from "../../lib/functions";
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
      // M4: a baseline is an immutable, versioned snapshot - this creates a
      // NEW version and never edits an earlier one. baselineDate (used by the
      // Traffic/Search charts) is set server-side to point at it.
      await captureBaseline(business!.id);
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
          בייסליין הוא צילום מצב שלא משתנה לעולם. שמירה נוספת יוצרת גרסה חדשה, והקודמות נשמרות. תאריך הבייסליין האחרון
          משמש כנקודת הייחוס להשוואות בלשוניות תנועה וחיפוש; הפירוט המלא בלשונית מודיעין חיפוש.
          {" "}
          {business.baselineDate ? `האחרון נשמר ב-${business.baselineDate}.` : "טרם נשמר."}
        </p>
        <button type="button" className="btn btn-outline" disabled={settingBaseline} onClick={handleSetBaseline}>
          {settingBaseline ? "שומר…" : business.baselineDate ? "שמירת גרסת בייסליין חדשה" : "שמירת בייסליין ראשון"}
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
