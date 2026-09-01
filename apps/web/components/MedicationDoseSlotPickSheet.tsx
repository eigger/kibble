"use client";

import { formatDoseTime } from "@kibble/shared";
import type { DoseSlotToday } from "../lib/types";

type SlotOption = {
  index: number;
  time: string;
};

type Props = {
  open: boolean;
  courseName: string;
  slots: SlotOption[];
  onClose: () => void;
  onPick: (slotIndex: number) => void;
  t: (key: string, params?: Record<string, string>) => string;
  locale: "ko" | "en";
};

export function MedicationDoseSlotPickSheet({
  open,
  courseName,
  slots,
  onClose,
  onPick,
  t,
  locale,
}: Props) {
  if (!open) return null;
  const localeTag = locale === "ko" ? "ko-KR" : "en-US";

  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <div
        className="sheet-card med-course-pick-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t("medicationSlotPickTitle")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <h2 className="med-course-sheet-title">{t("medicationSlotPickTitle")}</h2>
        <p className="meta med-course-pick-subtitle">{courseName}</p>
        <ul className="med-course-pick-list">
          {slots.map((slot) => (
            <li key={slot.index}>
              <button
                type="button"
                className="med-course-pick-item"
                onClick={() => onPick(slot.index)}
              >
                {formatDoseTime(slot.time, localeTag)}
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="btn-link chip-action-cancel" onClick={onClose}>
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}

export function pendingDoseSlots(
  doseTimes: string[],
  doseSlotsToday: DoseSlotToday[],
): { index: number; time: string }[] {
  if (doseTimes.length === 0) return [];
  const filled = new Set(
    doseSlotsToday.filter((slot) => slot.eventId != null).map((slot) => slot.index),
  );
  return doseTimes
    .map((time, index) => ({ index, time }))
    .filter((slot) => !filled.has(slot.index));
}
