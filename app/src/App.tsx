import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import BusinessWorkspace from "./pages/business/BusinessWorkspace";
import BusinessOverview from "./pages/business/BusinessOverview";
import BusinessActions from "./pages/business/BusinessActions";
import BusinessMeasurement from "./pages/business/BusinessMeasurement";
import BusinessSettings from "./pages/business/BusinessSettings";
import BusinessAiVisibility from "./pages/business/BusinessAiVisibility";
import BusinessTopics from "./pages/business/BusinessTopics";
import ComingNext from "./pages/business/ComingNext";
import BusinessIntelligence from "./pages/business/BusinessIntelligence";

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
        <Route path="topics" element={<BusinessTopics />} />
        <Route path="intelligence" element={<BusinessIntelligence />} />
        <Route path="actions" element={<BusinessActions />} />
        <Route path="measurement" element={<BusinessMeasurement />} />
        <Route path="settings" element={<BusinessSettings />} />
        <Route path="ai-visibility" element={<BusinessAiVisibility />} />
        {/* Pre-#23 URLs keep working: redirect into the new structure. */}
        <Route path="tasks" element={<Navigate to="../actions" replace />} />
        <Route path="opportunities" element={<Navigate to="../actions?tab=opportunities" replace />} />
        <Route path="search" element={<Navigate to="../measurement" replace />} />
        <Route path="traffic" element={<Navigate to="../measurement?tab=traffic" replace />} />
        <Route path="integrations" element={<Navigate to="../settings" replace />} />
        {/* Future modules: reachable by URL, not in the navigation. */}
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
