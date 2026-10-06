import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import {
  listGa4Properties,
  listSearchConsoleSites,
  connectIntegration,
  syncGa4,
  syncSearchConsole
} from "../lib/functions";

type GoogleProvider = "ga4" | "search_console";

interface ConnectIntegrationModalProps {
  businessId: string;
  provider: GoogleProvider;
  onClose: () => void;
  onConnected: () => void;
}

interface Option {
  id: string;
  label: string;
  sub?: string;
}

export function ConnectIntegrationModal({ businessId, provider, onClose, onConnected }: ConnectIntegrationModalProps) {
  const [options, setOptions] = useState<Option[] | null>(null);
  const [selected, setSelected] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        if (provider === "ga4") {
          const properties = await listGa4Properties();
          if (cancelled) return;
          const opts = properties.map((p) => ({ id: p.propertyId, label: p.displayName, sub: p.accountName }));
          setOptions(opts);
          if (opts[0]) setSelected(opts[0].id);
        } else {
          const sites = await listSearchConsoleSites();
          if (cancelled) return;
          const opts = sites.map((s) => ({ id: s.siteUrl, label: s.siteUrl, sub: s.permissionLevel }));
          setOptions(opts);
          if (opts[0]) setSelected(opts[0].id);
        }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "שגיאה בטעינת הנכסים הזמינים");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [provider]);

  async function handleConnect() {
    const opt = options?.find((o) => o.id === selected);
    if (!opt) return;
    setConnecting(true);
    setConnectError(null);
    try {
      await connectIntegration(businessId, provider, opt.id, opt.label);
      if (provider === "ga4") await syncGa4(businessId);
      else await syncSearchConsole(businessId);
      onConnected();
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : "שגיאה בחיבור");
    } finally {
      setConnecting(false);
    }
  }

  const title = provider === "ga4" ? "חיבור Google Analytics 4" : "חיבור Google Search Console";

  return (
    <Modal title={title} onClose={onClose}>
      {loadError && (
        <div className="login-error">
          {loadError}
          <div className="text-dim" style={{ fontSize: "0.8rem", marginTop: 6 }}>
            ודא שכתובת ה-Service Account של Visibility OS קיבלה הרשאת Viewer לנכס הרלוונטי, ושהמפתח שלו מוגדר כ-Secret
            בפונקציות.
          </div>
        </div>
      )}
      {!loadError && options === null && <div className="loading-row">טוען נכסים זמינים…</div>}
      {!loadError && options && options.length === 0 && (
        <div className="text-muted" style={{ marginTop: 8 }}>
          לא נמצאו נכסים שה-Service Account מחובר אליהם. שתף את הנכס הרלוונטי עם כתובת ה-Service Account וחזור לכאן.
        </div>
      )}
      {!loadError && options && options.length > 0 && (
        <>
          <div className="form-field">
            <label htmlFor="integ-property">נכס</label>
            <select id="integ-property" value={selected} onChange={(e) => setSelected(e.target.value)}>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                  {o.sub ? ` — ${o.sub}` : ""}
                </option>
              ))}
            </select>
          </div>
          {connectError && <div className="login-error">{connectError}</div>}
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={handleConnect} disabled={connecting}>
              {connecting ? "מתחבר…" : "חיבור וסנכרון"}
            </button>
            <button type="button" className="btn btn-outline" onClick={onClose}>
              ביטול
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
