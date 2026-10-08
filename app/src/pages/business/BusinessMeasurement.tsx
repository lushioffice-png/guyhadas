import { SubTabs, useSubTab } from "../../components/ui/SubTabs";
import BusinessSearch from "./BusinessSearch";
import BusinessTraffic from "./BusinessTraffic";

// מדידה - the existing Search Console and GA4 trend screens, unchanged.
const TABS = [
  { id: "search", label: "גוגל (Search Console)" },
  { id: "traffic", label: "תנועה לאתר (Analytics)" }
];

export default function BusinessMeasurement() {
  const [tab, setTab] = useSubTab(TABS, "search");
  return (
    <div>
      <SubTabs tabs={TABS} current={tab} onSelect={setTab} label="מדידה" />
      <div className="subtab-panel" role="tabpanel">{tab === "search" ? <BusinessSearch /> : <BusinessTraffic />}</div>
    </div>
  );
}
