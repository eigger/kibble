"use client";

import { useEffect, useRef, useState } from "react";
import { toDatetimeLocalValue } from "../lib/datetimeLocal";
import { resolveRoutineOccurredAt } from "../lib/routines";
import type { TranslationKey } from "../lib/i18n/translations";
import { useDialog } from "../lib/useDialog";

type Props = {
  open: boolean;
  label: string;
  summary: string;
  onClose: () => void;
  /** 기록 시각(ISO) — 손대지 않았으면 등록하는 순간 */
  onConfirm: (occurredAt: string) => void;
  t: (key: TranslationKey) => string;
};

/** 루틴을 누르면 뜨는 시트 — 기록 시각을 고른다(기본 지금). 등록하면 그 시각으로 항목 전부를 저장한다 */
export function RoutineTimeSheet({ open, label, summary, onClose, onConfirm, t }: Props) {
  const submitRef = useRef<HTMLButtonElement>(null);
  // 기본 "지금" 확인이 주된 용도라 시각 입력(피커)이 아니라 등록 버튼에 초점을 둔다
  const dialogRef = useDialog({ open, onClose, initialFocus: submitRef });
  const [value, setValue] = useState("");
  const [max, setMax] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    const now = toDatetimeLocalValue(new Date().toISOString());
    setValue(now);
    setMax(now);
    setTouched(false);
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onConfirm(resolveRoutineOccurredAt(value, touched, new Date()));
          }}
        >
        <label className="field-label" htmlFor="routine-time-input">
          {t("routineWhen")}
        </label>
        <input
          id="routine-time-input"
          type="datetime-local"
          className="event-detail-datetime"
          value={value}
          max={max}
          required
          onChange={(e) => {
            setValue(e.target.value);
            setTouched(true);
          }}
        />
        <div className="routine-time-actions">
          <button type="button" className="btn-link chip-action-cancel" onClick={onClose}>
            {t("cancel")}
          </button>
          <button ref={submitRef} type="submit" className="btn-primary">
            {t("routineRegister")}
          </button>
        </div>
        </form>
      </div>
    </div>
  );
}
