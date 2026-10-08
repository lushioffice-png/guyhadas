import { useEffect, useState } from "react";
import { NavLink, Outlet, useParams } from "react-router-dom";
import { AppShell } from "../../components/AppShell";
import { listenBusinesses } from "../../lib/firestore";
import type { Business } from "../../types";

// Primary navigation = the real workflow (issue #23). Future modules
// (competitors, content, experiments, reports) are not advertised here;
// their placeholder routes still exist. Old URLs redirect (see App.tsx).
const TABS: { to: string; label: string; end?: boolean }[] = [
  { to: "", label: "סקירה", end: true },
  { to: "intelligence", label: "מודיעין חיפוש" },
  { to: "topics", label: "נושאי חיפוש" },
  { to: "actions", label: "פעולות" },
  { to: "measurement", label: "מדידה" },
  { to: "ai-visibility", label: "נראות AI" },
  { to: "settings", label: "הגדרות" }
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
    <AppShell wide>
      <div className="app-main-header">
        <div>
          <h1 className="app-main-title">
            {business ? business.name : businesses === null ? "טוען…" : "עסק לא נמצא"}
          </h1>
          {business && (
            <div className="app-main-subtitle">
              {business.industry || "—"}{business.website ? ` · ${business.website}` : ""}
            </div>
          )}
        </div>
      </div>

      <nav className="workspace-tabs" aria-label="ניווט העסק">
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
