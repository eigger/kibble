"use client";

import { useEffect, useState } from "react";
import { fromDatetimeLocalValue, toDatetimeLocalValue } from "../lib/datetimeLocal";
import type { TranslationKey } from "../lib/i18n/translations";
import { useDialog } from "../lib/useDialog";

type Props = {
  open: boolean;
  label: string;
  summary: string;
  onClose: () => void;
  /** 고른 시각(ISO). 해석할 수 없는 값이면 지금 시각이 간다 (K-12) */
  onConfirm: (occurredAt: string) => void;
  t: (key: TranslationKey) => string;
};

/** 루틴을 누르면 뜨는 시트 — 기록 시각을 고른다(기본 지금). 등록하면 그 시각으로 항목 전부를 저장한다 */
export function RoutineTimeSheet({ open, label, summary, onClose, onConfirm, t }: Props) {
  const dialogRef = useDialog({ open, onClose });
  const [value, setValue] = useState("");

  useEffect(() => {
    if (open) setValue(toDatetimeLocalValue(new Date().toISOString()));
  }, [open]);

  if (!open) return null;

  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className="sheet-card routine-time-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <h2 className="med-course-sheet-title">{label}</h2>
        {summary && <p className="meta">{summary}</p>}
        <label className="field-label" htmlFor="routine-time-input">
          {t("routineWhen")}
        </label>
        <input
          id="routine-time-input"
          type="datetime-local"
          className="event-detail-datetime"
          value={value}
          required
          onChange={(e) => setValue(e.target.value)}
        />
        <div className="routine-time-actions">
          <button type="button" className="btn-link chip-action-cancel" onClick={onClose}>
            {t("cancel")}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() =>
              onConfirm(fromDatetimeLocalValue(value) ?? new Date().toISOString())
            }
          >
            {t("routineRegister")}
          </button>
        </div>
      </div>
    </div>
  );
}
