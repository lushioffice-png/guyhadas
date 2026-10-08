import { useSearchParams } from "react-router-dom";

export interface SubTab {
  id: string;
  label: string;
  count?: number | null;
}

// Local (in-page) tabs. The active tab lives in the URL (?tab=...) so it is
// deep-linkable and survives refresh, but switching is client-side only -
// no reload, no data call. Sticky under the page header.
export function useSubTab(tabs: SubTab[], fallback?: string): [string, (id: string) => void] {
  const [params, setParams] = useSearchParams();
  const ids = tabs.map((t) => t.id);
  const requested = params.get("tab");
  const current = requested && ids.includes(requested) ? requested : fallback || ids[0];
  const select = (id: string) => {
    const next = new URLSearchParams(params);
    if (id === (fallback || ids[0])) next.delete("tab");
    else next.set("tab", id);
    setParams(next, { replace: false });
  };
  return [current, select];
}

export function SubTabs({ tabs, current, onSelect, label }: { tabs: SubTab[]; current: string; onSelect: (id: string) => void; label: string }) {
  return (
    <div className="subtabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={current === t.id}
          className={`subtab ${current === t.id ? "active" : ""}`}
          onClick={() => onSelect(t.id)}
        >
          {t.label}
          {t.count != null && <span className="subtab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
