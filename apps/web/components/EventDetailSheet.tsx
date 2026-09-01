"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { QuickTimeKey } from "@kibble/shared";
import { resolveQuickTime } from "@kibble/shared";
import {
  fromDatetimeLocalValue,
  parseOptionalNumber,
  toDatetimeLocalValue,
} from "../lib/datetimeLocal";
import { apiJson } from "../lib/api";
import { eventDetailFields, formatScaleValuePart, quantityPlaceholder, resolveEventUnit, scale3FieldLabelKey, scale3ValueLabelKey } from "../lib/eventDetailFields";
import type { EventAttachment } from "../lib/types";
import { AttachmentLightbox } from "./AttachmentLightbox";
import { EventAttachmentThumb } from "./EventAttachmentThumb";
import { PendingAttachments } from "./PendingAttachments";

export interface EventDetailSaveMeta {
  removedAttachmentIds: string[];
}

export interface EventDetailDraft {
  /** create: 새 기록 | view: 상세 보기 | edit: 바로 수정 */
  mode: "create" | "view" | "edit";
  eventId?: string;
  petId: string;
  presetId?: string | null;
  eventTypeId?: string;
  eventTypeKey?: string | null;
  label: string;
  occurredAt: string;
  quantity: number | null;
  quantityOffered: number | null;
  unit: string | null;
  productName: string | null;
  clinicName: string | null;
  clinicAddress: string | null;
  note: string | null;
  scaleType?: string | null;
  scaleValue?: number | null;
  rawText?: string;
  entryId?: string;
  dedupeKey?: string;
  medicationCourseId?: string | null;
  doseSlotIndex?: number | null;
  needsReview?: boolean;
}

interface EventDetailSheetProps {
  open: boolean;
  draft: EventDetailDraft | null;
  saving: boolean;
  attachments?: EventAttachment[];
  pendingFiles?: File[];
  onPendingFilesChange?: (files: File[]) => void;
  onDeleteEvent?: () => void;
  deleting?: boolean;
  onClose: () => void;
  onSave: (draft: EventDetailDraft, meta: EventDetailSaveMeta) => void;
  onValidationError: (message: string) => void;
  saveError?: string | null;
  t: (key: string, params?: Record<string, string>) => string;
  locale?: "ko" | "en";
}

const QUICK_TIME_KEYS: QuickTimeKey[] = ["now", "oneHourAgo", "yesterdayEvening"];
const FECAL_SCORES = [1, 2, 3, 4, 5, 6, 7] as const;
const SCALE3_VALUES = [1, 2, 3] as const;

type ProductSuggestions = {
  lastProduct: string | null;
  frequent: { productName: string; count: number }[];
};

type ClinicSuggestions = {
  lastClinic: { name: string; address: string | null } | null;
  frequent: { name: string; address: string | null; count: number }[];
};

function draftSyncKey(draft: EventDetailDraft | null): string {
  if (!draft) return "";
  return `${draft.mode}:${draft.eventId ?? ""}:${draft.dedupeKey ?? ""}:${draft.presetId ?? ""}:${draft.entryId ?? ""}`;
}

function formatOccurredAt(iso: string, locale: "ko" | "en"): string {
  const d = new Date(iso);
  return d.toLocaleString(locale === "ko" ? "ko-KR" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  });
}

function resetFormFromDraft(
  draft: EventDetailDraft,
  setters: {
    setOccurredLocal: (v: string) => void;
    setProductName: (v: string) => void;
    setClinicName: (v: string) => void;
    setClinicAddress: (v: string) => void;
    setQuantityOffered: (v: string) => void;
    setQuantity: (v: string) => void;
    setUnit: (v: string) => void;
    setNote: (v: string) => void;
    setScaleValue: (v: number | null) => void;
    setRemovedAttachmentIds: (v: string[]) => void;
  },
) {
  setters.setOccurredLocal(toDatetimeLocalValue(draft.occurredAt));
  setters.setProductName(draft.productName ?? "");
  setters.setClinicName(draft.clinicName ?? "");
  setters.setClinicAddress(draft.clinicAddress ?? "");
  setters.setQuantityOffered(draft.quantityOffered != null ? String(draft.quantityOffered) : "");
  setters.setQuantity(draft.quantity != null ? String(draft.quantity) : "");
  setters.setUnit(draft.unit ?? "");
  setters.setNote(draft.note ?? "");
  setters.setScaleValue(draft.scaleValue ?? null);
  setters.setRemovedAttachmentIds([]);
}

export function EventDetailSheet({
  open,
  draft,
  saving,
  attachments = [],
  pendingFiles = [],
  onPendingFilesChange,
  onDeleteEvent,
  deleting = false,
  onClose,
  onSave,
  onValidationError,
  saveError,
  t,
  locale = "ko",
}: EventDetailSheetProps) {
  const [occurredLocal, setOccurredLocal] = useState("");
  const [productName, setProductName] = useState("");
  const [frequentProducts, setFrequentProducts] = useState<ProductSuggestions["frequent"]>([]);
  const [clinicName, setClinicName] = useState("");
  const [clinicAddress, setClinicAddress] = useState("");
  const [frequentClinics, setFrequentClinics] = useState<ClinicSuggestions["frequent"]>([]);
  const [quantityOffered, setQuantityOffered] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [note, setNote] = useState("");
  const [scaleValue, setScaleValue] = useState<number | null>(null);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [lightboxAtt, setLightboxAtt] = useState<EventAttachment | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const busy = saving || deleting;
  const syncKey = draftSyncKey(draft);

  const fields = useMemo(
    () => eventDetailFields(draft?.eventTypeKey, draft?.scaleType),
    [draft?.eventTypeKey, draft?.scaleType],
  );

  useEffect(() => {
    if (!open || !draft) return;
    resetFormFromDraft(draft, {
      setOccurredLocal,
      setProductName,
      setClinicName,
      setClinicAddress,
      setQuantityOffered,
      setQuantity,
      setUnit,
      setNote,
      setScaleValue,
      setRemovedAttachmentIds,
    });
    setFrequentProducts([]);
    setFrequentClinics([]);
    setIsEditing(draft.mode === "create" || draft.mode === "edit");
    setLightboxAtt(null);
  }, [open, syncKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !draft || !fields.productName) return;
    const editing = draft.mode === "create" || draft.mode === "edit";
    if (!editing) return;

    const eventTypeKey = draft.eventTypeKey?.trim();
    if (!eventTypeKey) return;

    let cancelled = false;
    void apiJson<ProductSuggestions>(
      `/api/events/product-suggestions?petId=${encodeURIComponent(draft.petId)}&eventTypeKey=${encodeURIComponent(eventTypeKey)}`,
    )
      .then((data) => {
        if (cancelled) return;
        setFrequentProducts(data.frequent);
        if (draft.mode === "create" && !draft.productName?.trim() && data.lastProduct) {
          setProductName(data.lastProduct);
        }
      })
      .catch(() => {
        if (!cancelled) setFrequentProducts([]);
      });

    return () => {
      cancelled = true;
    };
  }, [open, syncKey, fields.productName, draft?.mode, draft?.petId, draft?.eventTypeKey, draft?.productName]);

  useEffect(() => {
    if (!open || !draft || !fields.clinicName) return;
    const editing = draft.mode === "create" || draft.mode === "edit";
    if (!editing) return;

    let cancelled = false;
    void apiJson<ClinicSuggestions>(
      `/api/events/clinic-suggestions?petId=${encodeURIComponent(draft.petId)}`,
    )
      .then((data) => {
        if (cancelled) return;
        setFrequentClinics(data.frequent);
        if (draft.mode === "create" && !draft.clinicName?.trim() && data.lastClinic) {
          setClinicName(data.lastClinic.name);
          setClinicAddress(data.lastClinic.address ?? "");
        }
      })
      .catch(() => {
        if (!cancelled) setFrequentClinics([]);
      });

    return () => {
      cancelled = true;
    };
  }, [open, syncKey, fields.clinicName, draft?.mode, draft?.petId, draft?.clinicName]);

  const visibleAttachments = attachments.filter((a) => !removedAttachmentIds.includes(a.id));
  const showForm = isEditing;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy && !lightboxAtt) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, lightboxAtt, onClose]);

  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open, syncKey]);

  if (!open || !draft) return null;

  function applyQuickTime(key: QuickTimeKey) {
    const iso = resolveQuickTime(key).toISOString();
    setOccurredLocal(toDatetimeLocalValue(iso));
  }

  function handleCancelEdit() {
    if (draft!.mode === "create" || draft!.mode === "edit" || !draft!.eventId) {
      onClose();
      return;
    }
    resetFormFromDraft(draft!, {
      setOccurredLocal,
      setProductName,
      setClinicName,
      setClinicAddress,
      setQuantityOffered,
      setQuantity,
      setUnit,
      setNote,
      setScaleValue,
      setRemovedAttachmentIds,
    });
    setIsEditing(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;

    const occurredAt = fromDatetimeLocalValue(occurredLocal);
    if (!occurredAt) {
      onValidationError(t("eventDetailTimeInvalid"));
      return;
    }

    let offered: number | null = null;
    let consumed: number | null = null;
    if (fields.quantityOffered) {
      const parsed = parseOptionalNumber(quantityOffered);
      if (!parsed.ok) {
        onValidationError(t("eventDetailQuantityInvalid"));
        return;
      }
      offered = parsed.value;
    }
    if (fields.quantity) {
      const parsed = parseOptionalNumber(quantity);
      if (!parsed.ok) {
        onValidationError(t("eventDetailQuantityInvalid"));
        return;
      }
      consumed = parsed.value;
    }

    onSave(
      {
        ...draft,
        occurredAt,
        quantityOffered: fields.quantityOffered ? offered : null,
        quantity: fields.quantity ? consumed : null,
        unit: resolveEventUnit(fields, unit),
        productName: fields.productName ? productName.trim() || null : null,
        clinicName: fields.clinicName ? clinicName.trim() || null : null,
        clinicAddress: fields.clinicAddress ? clinicAddress.trim() || null : null,
        note: fields.note ? note.trim() || null : null,
        scaleValue: fields.fecalScale || fields.scale3 ? scaleValue : null,
        needsReview: false,
      },
      { removedAttachmentIds },
    );
  }

  function renderViewValue(label: string, value: string | null | undefined) {
    if (!value) return null;
    return (
      <div className="event-detail-view-row">
        <dt className="event-detail-view-label">{label}</dt>
        <dd className="event-detail-view-value">{value}</dd>
      </div>
    );
  }

  return (
    <>
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
          <div className="event-detail-header-row">
            <h2 className="event-detail-heading">{draft.label}</h2>
          </div>

          {!showForm ? (
            <div className="event-detail-view">
              <dl className="event-detail-view-fields">
                {renderViewValue(t("eventDetailTimeLabel"), formatOccurredAt(draft.occurredAt, locale))}
                {fields.quantityOffered &&
                  renderViewValue(
                    t(fields.quantityOfferedLabelKey),
                    draft.quantityOffered != null ? String(draft.quantityOffered) : null,
                  )}
                {fields.quantity &&
                  renderViewValue(
                    t(fields.quantityLabelKey),
                    draft.quantity != null
                      ? `${draft.quantity}${draft.unit ?? fields.defaultUnit ?? ""}`
                      : null,
                  )}
                {fields.showUnitInput && renderViewValue(t("eventDetailUnit"), draft.unit)}
                {fields.productName && renderViewValue(t("eventDetailProductName"), draft.productName)}
                {fields.clinicName && renderViewValue(t("eventDetailClinicName"), draft.clinicName)}
                {fields.clinicAddress && renderViewValue(t("eventDetailClinicAddress"), draft.clinicAddress)}
                {fields.fecalScale &&
                  renderViewValue(
                    t("eventDetailFecalScore"),
                    draft.scaleValue != null
                      ? formatScaleValuePart(draft.scaleType, draft.scaleValue, t)
                      : null,
                  )}
                {fields.scale3 &&
                  renderViewValue(
                    t(scale3FieldLabelKey(draft.scaleType)),
                    draft.scaleValue != null
                      ? formatScaleValuePart(draft.scaleType, draft.scaleValue, t)
                      : null,
                  )}
                {fields.note && renderViewValue(t("eventDetailNote"), draft.note)}
              </dl>

              {attachments.length > 0 && (
                <section className="event-detail-view-attachments" aria-label={t("eventDetailAttachments")}>
                  <h3 className="field-label">{t("eventDetailAttachments")}</h3>
                  <ul className="event-detail-view-attachments-list">
                    {attachments.map((att) => (
                      <li key={att.id}>
                        <button
                          type="button"
                          className="event-detail-view-att-btn"
                          onClick={() => setLightboxAtt(att)}
                        >
                          <EventAttachmentThumb
                            path={att.path}
                            mime={att.mime}
                            alt=""
                            className="attachment-thumb attachment-thumb-large"
                          />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <div className="event-detail-actions">
                <div className="event-detail-actions-primary">
                  {draft.eventId && (
                    <button
                      type="button"
                      className="event-detail-sheet-btn event-detail-sheet-btn-primary"
                      disabled={busy}
                      onClick={() => setIsEditing(true)}
                    >
                      {t("edit")}
                    </button>
                  )}
                  <button
                    type="button"
                    className="event-detail-sheet-btn"
                    disabled={busy}
                    onClick={onClose}
                  >
                    {t("close")}
                  </button>
                </div>
              </div>
            </div>
          ) : (
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

              {fields.productName && (
                <div className="event-detail-product">
                  <label className="field-label" htmlFor="event-product">
                    {t("eventDetailProductName")}
                  </label>
                  <input
                    id="event-product"
                    type="text"
                    className="event-detail-product-input"
                    placeholder={t("eventDetailProductNamePlaceholder")}
                    maxLength={120}
                    value={productName}
                    disabled={busy}
                    onChange={(e) => setProductName(e.target.value)}
                  />
                  {frequentProducts.length > 0 && (
                    <div className="event-detail-product-chips">
                      <span className="event-detail-product-chips-label">{t("eventDetailFrequentProducts")}</span>
                      {frequentProducts.map((item) => (
                        <button
                          key={item.productName}
                          type="button"
                          className="chip chip-compact"
                          disabled={busy}
                          onClick={() => setProductName(item.productName)}
                        >
                          {item.productName}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {(fields.clinicName || fields.clinicAddress) && (
                <div className="event-detail-clinic">
                  {fields.clinicName && (
                    <>
                      <label className="field-label" htmlFor="event-clinic-name">
                        {t("eventDetailClinicName")}
                      </label>
                      <input
                        id="event-clinic-name"
                        type="text"
                        className="event-detail-product-input"
                        placeholder={t("eventDetailClinicNamePlaceholder")}
                        maxLength={120}
                        value={clinicName}
                        disabled={busy}
                        onChange={(e) => setClinicName(e.target.value)}
                      />
                    </>
                  )}
                  {fields.clinicAddress && (
                    <>
                      <label className="field-label" htmlFor="event-clinic-address">
                        {t("eventDetailClinicAddress")}
                      </label>
                      <input
                        id="event-clinic-address"
                        type="text"
                        className="event-detail-product-input"
                        placeholder={t("eventDetailClinicAddressPlaceholder")}
                        maxLength={200}
                        value={clinicAddress}
                        disabled={busy}
                        onChange={(e) => setClinicAddress(e.target.value)}
                      />
                    </>
                  )}
                  {frequentClinics.length > 0 && (
                    <div className="event-detail-product-chips">
                      <span className="event-detail-product-chips-label">{t("eventDetailFrequentClinics")}</span>
                      {frequentClinics.map((item) => (
                        <button
                          key={`${item.name}|${item.address ?? ""}`}
                          type="button"
                          className="chip chip-compact"
                          disabled={busy}
                          onClick={() => {
                            setClinicName(item.name);
                            setClinicAddress(item.address ?? "");
                          }}
                        >
                          {item.address ? `${item.name} · ${item.address}` : item.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {(fields.quantityOffered || fields.quantity) && (
                <div className="event-detail-qty-row">
                  {fields.quantityOffered && (
                    <div>
                      <label className="field-label" htmlFor="event-qty-offered">
                        {t(fields.quantityOfferedLabelKey)}
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
                  )}
                  {fields.quantity && (
                    <div>
                      <label className="field-label" htmlFor="event-qty-consumed">
                        {t(fields.quantityLabelKey)}
                      </label>
                      <input
                        id="event-qty-consumed"
                        type="text"
                        inputMode="decimal"
                        className="event-detail-qty-input"
                        placeholder={quantityPlaceholder(draft.eventTypeKey, fields.quantityOffered)}
                        value={quantity}
                        disabled={busy}
                        onChange={(e) => setQuantity(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}

              {fields.showUnitInput && (
                <>
                  <label className="field-label" htmlFor="event-unit">
                    {t("eventDetailUnit")}
                  </label>
                  <input
                    id="event-unit"
                    type="text"
                    className="event-detail-unit"
                    placeholder={fields.defaultUnit ?? "g"}
                    maxLength={32}
                    value={unit}
                    disabled={busy}
                    onChange={(e) => setUnit(e.target.value)}
                  />
                </>
              )}

              {fields.note && (
                <>
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
                </>
              )}

              {fields.fecalScale && (
                <fieldset className="event-detail-fieldset">
                  <legend className="field-label">{t("eventDetailFecalScore")}</legend>
                  <p className="meta event-detail-scale-hint">{t("eventDetailFecalScoreHint")}</p>
                  <div
                    className="chip-row event-detail-scale-row"
                    role="group"
                    aria-label={t("eventDetailFecalScore")}
                  >
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

              {fields.scale3 && (
                <fieldset className="event-detail-fieldset">
                  <legend className="field-label">{t(scale3FieldLabelKey(draft.scaleType))}</legend>
                  <div
                    className="chip-row event-detail-scale-row"
                    role="group"
                    aria-label={t(scale3FieldLabelKey(draft.scaleType))}
                  >
                    {SCALE3_VALUES.map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={`chip chip-compact${scaleValue === value ? " chip-selected" : ""}`}
                        disabled={busy}
                        aria-pressed={scaleValue === value}
                        onClick={() => setScaleValue((prev) => (prev === value ? null : value))}
                      >
                        {t(scale3ValueLabelKey(draft.scaleType, value))}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}

              {(visibleAttachments.length > 0 || onPendingFilesChange) && (
                <fieldset className="event-detail-fieldset">
                  <legend className="field-label">{t("eventDetailAttachments")}</legend>
                  {visibleAttachments.length > 0 && (
                    <ul className="event-detail-attachments-list">
                      {visibleAttachments.map((att) => (
                        <li key={att.id} className="event-detail-attachments-item">
                          <button
                            type="button"
                            className="event-detail-view-att-btn"
                            onClick={() => setLightboxAtt(att)}
                          >
                            <EventAttachmentThumb
                              path={att.path}
                              mime={att.mime}
                              alt=""
                              className="attachment-thumb attachment-thumb-large"
                            />
                          </button>
                          {draft.eventId && (
                            <button
                              type="button"
                              className="attachment-remove-btn"
                              disabled={busy}
                              aria-label={t("removeAttachment")}
                              onClick={() =>
                                setRemovedAttachmentIds((prev) =>
                                  prev.includes(att.id) ? prev : [...prev, att.id],
                                )
                              }
                            >
                              <span aria-hidden>×</span>
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {onPendingFilesChange && (
                    <PendingAttachments
                      files={pendingFiles}
                      existingCount={visibleAttachments.length}
                      disabled={busy}
                      onChange={onPendingFilesChange}
                      t={t}
                    />
                  )}
                </fieldset>
              )}

              <div className="event-detail-actions">
                {saveError && <p className="error-text event-detail-save-error">{saveError}</p>}
                {draft.eventId && onDeleteEvent && (
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
                  <button type="button" className="secondary" disabled={busy} onClick={handleCancelEdit}>
                    {t("cancel")}
                  </button>
                  <button type="submit" disabled={busy}>
                    {saving ? t("saving") : t("save")}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>

      {lightboxAtt && (
        <AttachmentLightbox
          path={lightboxAtt.path}
          mime={lightboxAtt.mime}
          onClose={() => setLightboxAtt(null)}
          closeLabel={t("close")}
        />
      )}
    </>
  );
}
