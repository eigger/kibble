"use client";

import { useEffect, useRef, useState } from "react";
import type { QuickTimeKey } from "@kibble/shared";
import { resolveQuickTime } from "@kibble/shared";
import {
  fromDatetimeLocalValue,
  parseOptionalNumber,
  toDatetimeLocalValue,
} from "../lib/datetimeLocal";

export interface EventDetailDraft {
  mode: "create" | "edit";
  eventId?: string;
  petId: string;
  presetId?: string | null;
  eventTypeId?: string;
  label: string;
  occurredAt: string;
  quantity: number | null;
  quantityOffered: number | null;
  unit: string | null;
  note: string | null;
  rawText?: string;
  entryId?: string;
  dedupeKey?: string;
  needsReview?: boolean;
}

interface EventDetailSheetProps {
  open: boolean;
  draft: EventDetailDraft | null;
  saving: boolean;
  onClose: () => void;
  onSave: (draft: EventDetailDraft) => void;
  onValidationError: (message: string) => void;
  t: (key: string) => string;
}

const QUICK_TIME_KEYS: QuickTimeKey[] = ["now", "oneHourAgo", "yesterdayEvening"];

export function EventDetailSheet({
  open,
  draft,
  saving,
  onClose,
  onSave,
  onValidationError,
  t,
}: EventDetailSheetProps) {
  const [occurredLocal, setOccurredLocal] = useState("");
  const [quantityOffered, setQuantityOffered] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [note, setNote] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!draft) return;
    setOccurredLocal(toDatetimeLocalValue(draft.occurredAt));
    setQuantityOffered(draft.quantityOffered != null ? String(draft.quantityOffered) : "");
    setQuantity(draft.quantity != null ? String(draft.quantity) : "");
    setUnit(draft.unit ?? "");
    setNote(draft.note ?? "");
  }, [draft]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, saving, onClose]);

  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open, draft]);

  if (!open || !draft) return null;

  function applyQuickTime(key: QuickTimeKey) {
    const iso = resolveQuickTime(key).toISOString();
    setOccurredLocal(toDatetimeLocalValue(iso));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;

    const occurredAt = fromDatetimeLocalValue(occurredLocal);
    if (!occurredAt) {
      onValidationError(t("eventDetailTimeInvalid"));
      return;
    }

    const offered = parseOptionalNumber(quantityOffered);
    const consumed = parseOptionalNumber(quantity);
    if (!offered.ok || !consumed.ok) {
      onValidationError(t("eventDetailQuantityInvalid"));
      return;
    }

    onSave({
      ...draft,
      occurredAt,
      quantityOffered: offered.value,
      quantity: consumed.value,
      unit: unit.trim() || null,
      note: note.trim() || null,
      needsReview: false,
    });
  }

  return (
    <div className="sheet-backdrop" role="presentation" onClick={() => !saving && onClose()}>
      <div
        ref={dialogRef}
        className="sheet-card event-detail-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t("eventDetailTitle")}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <h2 className="event-detail-heading">{draft.label}</h2>

        <form className="event-detail-form" onSubmit={handleSubmit}>
          <fieldset className="event-detail-fieldset">
            <legend className="field-label">{t("eventDetailTimeLabel")}</legend>
            <div className="chip-row event-detail-quick-times">
              {QUICK_TIME_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  className="chip chip-compact"
                  disabled={saving}
                  onClick={() => applyQuickTime(key)}
                >
                  {t(`quickTime.${key}`)}
                </button>
              ))}
            </div>
            <input
              type="datetime-local"
              className="event-detail-datetime"
              value={occurredLocal}
              required
              disabled={saving}
              onChange={(e) => setOccurredLocal(e.target.value)}
            />
          </fieldset>

          <div className="event-detail-qty-row">
            <div>
              <label className="field-label" htmlFor="event-qty-offered">
                {t("eventDetailQuantityOffered")}
              </label>
              <input
                id="event-qty-offered"
                type="text"
                inputMode="decimal"
                className="event-detail-qty-input"
                placeholder="100"
                value={quantityOffered}
                disabled={saving}
                onChange={(e) => setQuantityOffered(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="event-qty-consumed">
                {t("eventDetailQuantityConsumed")}
              </label>
              <input
                id="event-qty-consumed"
                type="text"
                inputMode="decimal"
                className="event-detail-qty-input"
                placeholder="30"
                value={quantity}
                disabled={saving}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
          </div>

          <label className="field-label" htmlFor="event-unit">
            {t("eventDetailUnit")}
          </label>
          <input
            id="event-unit"
            type="text"
            className="event-detail-unit"
            placeholder="g"
            maxLength={32}
            value={unit}
            disabled={saving}
            onChange={(e) => setUnit(e.target.value)}
          />

          <label className="field-label" htmlFor="event-note">
            {t("eventDetailNote")}
          </label>
          <textarea
            id="event-note"
            className="event-detail-note"
            rows={2}
            maxLength={4000}
            value={note}
            disabled={saving}
            onChange={(e) => setNote(e.target.value)}
          />

          <div className="event-detail-actions">
            <button type="button" className="secondary" disabled={saving} onClick={onClose}>
              {t("cancel")}
            </button>
            <button type="submit" disabled={saving}>
              {saving ? t("saving") : t("save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
