import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import BusinessWorkspace from "./pages/business/BusinessWorkspace";
import BusinessOverview from "./pages/business/BusinessOverview";
import BusinessTasks from "./pages/business/BusinessTasks";
import BusinessOpportunities from "./pages/business/BusinessOpportunities";
import BusinessIntegrations from "./pages/business/BusinessIntegrations";
import BusinessTraffic from "./pages/business/BusinessTraffic";
import BusinessSearch from "./pages/business/BusinessSearch";
import ComingNext from "./pages/business/ComingNext";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

      <Route
        path="/business/:businessId"
        element={<ProtectedRoute><BusinessWorkspace /></ProtectedRoute>}
      >
        <Route index element={<BusinessOverview />} />
        <Route path="tasks" element={<BusinessTasks />} />
        <Route path="opportunities" element={<BusinessOpportunities />} />
        <Route path="integrations" element={<BusinessIntegrations />} />
        <Route path="search" element={<BusinessSearch />} />
        <Route path="traffic" element={<BusinessTraffic />} />
        <Route
          path="ai-visibility"
          element={<ComingNext title="נראות AI" description="מנוע הניטור האוטומטי של נראות AI מתוכנן לשלב מאוחר יותר." />}
        />
        <Route
          path="competitors"
          element={<ComingNext title="מתחרים" description="ניתוח מתחרים מתוכנן לשלב הבא, בין היתר באמצעות Semrush." />}
        />
        <Route
          path="content"
          element={<ComingNext title="תוכן" description="ניהול נכסי תוכן מתוכנן לשלב הבא." />}
        />
        <Route
          path="experiments"
          element={<ComingNext title="ניסויים" description="מעקב ניסויים מתוכנן לשלב הבא." />}
        />
        <Route
          path="reports"
          element={<ComingNext title="דוחות" description="דוחות מרוכזים מתוכננים לשלב הבא." />}
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
