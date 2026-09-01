"use client";

import { useEffect, useRef, useState } from "react";
import type { QuickTimeKey } from "@kibble/shared";
import { resolveQuickTime } from "@kibble/shared";
import {
  fromDatetimeLocalValue,
  parseOptionalNumber,
  toDatetimeLocalValue,
} from "../lib/datetimeLocal";
import type { EventAttachment } from "../lib/types";
import { EventAttachmentThumb } from "./EventAttachmentThumb";
import { PendingAttachments } from "./PendingAttachments";

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
  scaleType?: string | null;
  scaleValue?: number | null;
  rawText?: string;
  entryId?: string;
  dedupeKey?: string;
  needsReview?: boolean;
}

interface EventDetailSheetProps {
  open: boolean;
  draft: EventDetailDraft | null;
  saving: boolean;
  attachments?: EventAttachment[];
  pendingFiles?: File[];
  onPendingFilesChange?: (files: File[]) => void;
  onDeleteAttachment?: (attachmentId: string) => void;
  onDeleteEvent?: () => void;
  deleting?: boolean;
  onClose: () => void;
  onSave: (draft: EventDetailDraft) => void;
  onValidationError: (message: string) => void;
  t: (key: string, params?: Record<string, string>) => string;
}

const QUICK_TIME_KEYS: QuickTimeKey[] = ["now", "oneHourAgo", "yesterdayEvening"];
const FECAL_SCORES = [1, 2, 3, 4, 5, 6, 7] as const;

export function EventDetailSheet({
  open,
  draft,
  saving,
  attachments = [],
  pendingFiles = [],
  onPendingFilesChange,
  onDeleteAttachment,
  onDeleteEvent,
  deleting = false,
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
  const [scaleValue, setScaleValue] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const busy = saving || deleting;

  useEffect(() => {
    if (!draft) return;
    setOccurredLocal(toDatetimeLocalValue(draft.occurredAt));
    setQuantityOffered(draft.quantityOffered != null ? String(draft.quantityOffered) : "");
    setQuantity(draft.quantity != null ? String(draft.quantity) : "");
    setUnit(draft.unit ?? "");
    setNote(draft.note ?? "");
    setScaleValue(draft.scaleValue ?? null);
  }, [draft]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onClose]);

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
      scaleValue: draft.scaleType === "FECAL_7" ? scaleValue : null,
      needsReview: false,
    });
  }

  return (
    <div className="sheet-backdrop" role="presentation" onClick={() => !busy && onClose()}>
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
                  disabled={busy}
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
              disabled={busy}
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
                disabled={busy}
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
                disabled={busy}
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
            disabled={busy}
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
            disabled={busy}
            onChange={(e) => setNote(e.target.value)}
          />

          {draft.scaleType === "FECAL_7" && (
            <fieldset className="event-detail-fieldset">
              <legend className="field-label">{t("eventDetailFecalScore")}</legend>
              <p className="meta event-detail-scale-hint">{t("eventDetailFecalScoreHint")}</p>
              <div className="chip-row event-detail-scale-row" role="group" aria-label={t("eventDetailFecalScore")}>
                {FECAL_SCORES.map((score) => (
                  <button
                    key={score}
                    type="button"
                    className={`chip chip-compact${scaleValue === score ? " chip-selected" : ""}`}
                    disabled={busy}
                    aria-pressed={scaleValue === score}
                    onClick={() => setScaleValue((prev) => (prev === score ? null : score))}
                  >
                    {score}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {(attachments.length > 0 || onPendingFilesChange) && (
            <fieldset className="event-detail-fieldset">
              <legend className="field-label">{t("eventDetailAttachments")}</legend>
              {attachments.length > 0 && (
                <ul className="event-detail-attachments-list">
                  {attachments.map((att) => (
                    <li key={att.id} className="event-detail-attachments-item">
                      <EventAttachmentThumb
                        path={att.path}
                        mime={att.mime}
                        alt=""
                        className="attachment-thumb"
                      />
                      {onDeleteAttachment && (
                        <button
                          type="button"
                          className="pending-attachments-remove"
                          disabled={busy}
                          aria-label={t("removeAttachment")}
                          onClick={() => onDeleteAttachment(att.id)}
                        >
                          ×
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {onPendingFilesChange && (
                <PendingAttachments
                  files={pendingFiles}
                  existingCount={attachments.length}
                  disabled={busy}
                  onChange={onPendingFilesChange}
                  t={t}
                />
              )}
            </fieldset>
          )}

          <div className="event-detail-actions">
            {draft.mode === "edit" && onDeleteEvent && (
              <button
                type="button"
                className="danger event-detail-delete"
                disabled={busy}
                onClick={onDeleteEvent}
              >
                {deleting ? t("deleting") : t("eventDetailDelete")}
              </button>
            )}
            <div className="event-detail-actions-primary">
              <button type="button" className="secondary" disabled={busy} onClick={onClose}>
                {t("cancel")}
              </button>
              <button type="submit" disabled={busy}>
                {saving ? t("saving") : t("save")}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
