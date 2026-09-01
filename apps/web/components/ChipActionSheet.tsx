"use client";

interface ChipActionSheetProps {
  open: boolean;
  label: string;
  onClose: () => void;
  onDetail: () => void;
  onHide: () => void;
  t: (key: string) => string;
}

export function ChipActionSheet({ open, label, onClose, onDetail, onHide, t }: ChipActionSheetProps) {
  if (!open) return null;

  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <div
        className="sheet-card chip-action-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t("chipActionTitle")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <h2 className="chip-action-heading">{label}</h2>
        <div className="chip-action-list">
          <button type="button" className="chip-action-item" onClick={onDetail}>
            {t("chipActionDetail")}
          </button>
          <button type="button" className="chip-action-item chip-action-danger" onClick={onHide}>
            {t("chipActionHide")}
          </button>
        </div>
        <button type="button" className="btn-link chip-action-cancel" onClick={onClose}>
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}
