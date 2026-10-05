import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { StatusBadge } from "../../components/StatusBadge";
import { listenIntegrations } from "../../lib/firestore";
import { INTEGRATION_LABELS } from "../../types";
import type { Integration, IntegrationProvider } from "../../types";
import type { BusinessContext } from "./BusinessWorkspace";

// Every provider the Visibility OS is meant to support, per the architecture
// spec - shown even before any Firestore doc exists for it, so the business
// owner sees the full planned integration surface, not just what's connected.
const ALL_PROVIDERS: IntegrationProvider[] = ["ga4", "search_console", "semrush", "openai", "anthropic", "xai", "n8n"];

export default function BusinessIntegrations() {
  const { business } = useOutletContext<BusinessContext>();
  const [integrations, setIntegrations] = useState<Integration[] | null>(null);

  useEffect(() => {
    if (!business) return;
    return listenIntegrations(business.id, setIntegrations);
  }, [business]);

  if (!business) return <div className="loading-row">טוען…</div>;

  const byProvider = new Map((integrations || []).map((i) => [i.provider, i]));

  return (
    <div className="section-block">
      <h2 className="section-title">אינטגרציות</h2>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>ספק</th>
              <th>סטטוס</th>
              <th>Property</th>
              <th>סנכרון אחרון</th>
            </tr>
          </thead>
          <tbody>
            {ALL_PROVIDERS.map((provider) => {
              const integ = byProvider.get(provider);
              return (
                <tr key={provider}>
                  <td>{INTEGRATION_LABELS[provider]}</td>
                  <td><StatusBadge status={integ?.status || "not_connected"} /></td>
                  <td className="text-muted">{integ?.propertyLabel || "—"}</td>
                  <td className="text-muted">—</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-dim" style={{ fontSize: "0.8rem", marginTop: 12 }}>
        חיבורי Google (GA4 / Search Console) יתווספו ב-Milestone 2, דרך Service Account ייעודי.
        Semrush ממתין להקצאת יחידות API בחשבון הקיים.
      </p>
    </div>
  );
}
