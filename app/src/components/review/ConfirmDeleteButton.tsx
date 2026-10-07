import { useState } from "react";

// Delete is deliberately secondary: a quiet text button that asks for a
// second click before anything is removed.
export function ConfirmDeleteButton({ onConfirm, label = "מחיקה" }: { onConfirm: () => Promise<unknown> | void; label?: string }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!asking) {
    return (
      <button type="button" className="btn btn-text-danger btn-xs" onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <span className="inline-actions" role="group" aria-label="אישור מחיקה">
      <span className="text-dim" style={{ fontSize: "0.8rem", alignSelf: "center" }}>למחוק לצמיתות?</span>
      <button
        type="button"
        className="btn btn-danger btn-xs"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onConfirm();
          } finally {
            setBusy(false);
            setAsking(false);
          }
        }}
      >
        כן, למחוק
      </button>
      <button type="button" className="btn btn-quiet btn-xs" onClick={() => setAsking(false)}>
        ביטול
      </button>
    </span>
  );
}
