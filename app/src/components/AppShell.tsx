import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

// `wide`: analytics workspaces use more of a desktop screen (issue #23).
export function AppShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const { user, signOut } = useAuth();

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-brand">
          <NavLink to="/" style={{ textDecoration: "none" }}>
            <div className="app-brand-name">GuyHadas Visibility OS</div>
          </NavLink>
          <div className="app-brand-sub">מרכז בקרה פרטי</div>
        </div>

        <nav className="app-nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
            לוח בקרה ראשי
          </NavLink>
        </nav>

        <div className="app-sidebar-footer">
          {user?.email && <div className="app-sidebar-user">{user.email}</div>}
          <button className="btn btn-outline btn-sm" onClick={() => signOut()}>
            התנתקות
          </button>
        </div>
      </aside>

      <main className="app-main">
        <div className={`app-main-inner${wide ? " wide" : ""}`}>{children}</div>
      </main>
    </div>
  );
}
