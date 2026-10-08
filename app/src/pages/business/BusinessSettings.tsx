import { useOutletContext } from "react-router-dom";
import { SubTabs, useSubTab } from "../../components/ui/SubTabs";
import BusinessIntegrations from "./BusinessIntegrations";
import type { BusinessContext } from "./BusinessWorkspace";

// הגדרות - connections (existing integrations screen) and the business
// profile (moved here from the overview, read-only as before).
const TABS = [
  { id: "integrations", label: "חיבורים" },
  { id: "profile", label: "פרופיל העסק" }
];

function Profile() {
  const { business } = useOutletContext<BusinessContext>();
  if (!business) return <div className="loading-row">טוען…</div>;
  const rows: [string, string | undefined][] = [
    ["אתר", business.website],
    ["תחום", business.industry],
    ["תיאור", business.description],
    ["שוק עיקרי", business.primaryMarket],
    ["אזורי שירות", business.geographicMarkets?.join(", ")],
    ["קהל יעד", business.targetAudience],
    ["שירותים", business.services?.join(", ")],
    ["יעדים עסקיים", business.businessObjectives],
    ["יעדי המרה עיקריים", business.primaryConversionGoals]
  ];
  return (
    <div className="section-block">
      <h2 className="section-title">פרופיל העסק</h2>
      <div className="data-table-wrap">
        <table className="data-table">
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}>
                <th style={{ width: 200 }}>{label}</th>
                <td>{value || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function BusinessSettings() {
  const [tab, setTab] = useSubTab(TABS, "integrations");
  return (
    <div>
      <SubTabs tabs={TABS} current={tab} onSelect={setTab} label="הגדרות" />
      <div className="subtab-panel" role="tabpanel">{tab === "integrations" ? <BusinessIntegrations /> : <Profile />}</div>
    </div>
  );
}
