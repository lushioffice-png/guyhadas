import { useEffect, useState } from "react";
import { NavLink, Outlet, useParams } from "react-router-dom";
import { AppShell } from "../../components/AppShell";
import { listenBusinesses } from "../../lib/firestore";
import type { Business } from "../../types";

const TABS: { to: string; label: string; end?: boolean }[] = [
  { to: "", label: "סקירה כללית", end: true },
  { to: "search", label: "חיפוש" },
  { to: "traffic", label: "תנועה" },
  { to: "ai-visibility", label: "נראות AI" },
  { to: "competitors", label: "מתחרים" },
  { to: "opportunities", label: "הזדמנויות" },
  { to: "content", label: "תוכן" },
  { to: "tasks", label: "משימות" },
  { to: "integrations", label: "אינטגרציות" },
  { to: "experiments", label: "ניסויים" },
  { to: "reports", label: "דוחות" }
];

export interface BusinessContext {
  business: Business | null;
}

export default function BusinessWorkspace() {
  const { businessId } = useParams<{ businessId: string }>();
  const [businesses, setBusinesses] = useState<Business[] | null>(null);

  useEffect(() => {
    return listenBusinesses(setBusinesses);
  }, []);

  const business = businesses?.find((b) => b.id === businessId) ?? null;

  return (
    <AppShell>
      <div className="app-main-header">
        <div>
          <h1 className="app-main-title">
            {business ? business.name : businesses === null ? "טוען…" : "עסק לא נמצא"}
          </h1>
          {business && (
            <div className="app-main-subtitle">
              Business {String(business.businessNumber).padStart(3, "0")} · {business.industry || "—"}
            </div>
          )}
        </div>
      </div>

      <nav className="workspace-tabs">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to || "."}
            end={tab.end}
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <Outlet context={{ business } satisfies BusinessContext} />
    </AppShell>
  );
}
