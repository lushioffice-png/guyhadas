import { SubTabs, useSubTab } from "../../components/ui/SubTabs";
import BusinessTasks from "./BusinessTasks";
import BusinessOpportunities from "./BusinessOpportunities";

// פעולות - the existing manual tasks and opportunities, unchanged, as two
// local tabs. (Automatic opportunity generation is M5 and not built.)
const TABS = [
  { id: "tasks", label: "משימות" },
  { id: "opportunities", label: "הזדמנויות" }
];

export default function BusinessActions() {
  const [tab, setTab] = useSubTab(TABS, "tasks");
  return (
    <div>
      <SubTabs tabs={TABS} current={tab} onSelect={setTab} label="פעולות" />
      <div className="subtab-panel" role="tabpanel">{tab === "tasks" ? <BusinessTasks /> : <BusinessOpportunities />}</div>
    </div>
  );
}
