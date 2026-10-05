import type { IntegrationStatus } from "../types";

const LABELS: Record<IntegrationStatus, string> = {
  connected: "מחובר",
  not_connected: "לא מחובר",
  auth_required: "נדרש אימות",
  error: "שגיאה"
};

const CLASS: Record<IntegrationStatus, string> = {
  connected: "connected",
  not_connected: "not-connected",
  auth_required: "pending",
  error: "error"
};

export function StatusBadge({ status }: { status: IntegrationStatus }) {
  return <span className={`status-badge ${CLASS[status]}`}>{LABELS[status]}</span>;
}
