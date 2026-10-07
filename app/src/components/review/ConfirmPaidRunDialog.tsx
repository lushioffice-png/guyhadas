import { Modal } from "../Modal";

// The only way to start a paid external-API run that bypasses the cache.
// The free option (reuse the existing result) is listed first and is the
// default focus; the paid option states that it calls the provider and
// what it is expected to cost.
export function ConfirmPaidRunDialog({
  providerLabel,
  lastCostUsd,
  estimateNote,
  onReuse,
  onConfirmPaid,
  onClose
}: {
  providerLabel: string;
  lastCostUsd?: number | null;
  estimateNote: string;
  onReuse: () => void;
  onConfirmPaid: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title="קיים ניתוח קודם" onClose={onClose}>
      <p style={{ marginTop: 0 }}>
        נמצאה תוצאה קיימת לאותו קלט בדיוק. אפשר להשתמש בה <strong>ללא עלות ($0)</strong>.
      </p>
      <p className="text-muted" style={{ fontSize: "0.9rem" }}>
        ניתוח חדש ישלח פנייה חדשה ל-{providerLabel} ויחויב בתשלום.
        {lastCostUsd != null && ` עלות הפנייה הקודמת: $${lastCostUsd.toFixed(4)}.`} {estimateNote}
      </p>
      <div className="form-actions" style={{ flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary" autoFocus onClick={onReuse}>
          שימוש בתוצאה הקיימת ($0)
        </button>
        <button type="button" className="btn btn-outline" onClick={onConfirmPaid}>
          הרצת ניתוח חדש — בתשלום
        </button>
      </div>
    </Modal>
  );
}
