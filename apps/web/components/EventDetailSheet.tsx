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
import { loadEventDetailPrefs, saveEventDetailPrefs } from "../lib/eventDetailPrefs";
import {
  encodeProductNameValue,
  formatProductNameDisplay,
  parseProductNameValue,
  toggleProductNameTag,
} from "../lib/eventDetailTags";
import type { EventAttachment } from "../lib/types";
import { mapsEnabled } from "../lib/maps/types";
import { useMapProviders } from "../lib/maps/useMapProviders";
import { geocodeAddress } from "../lib/maps/geocode";
import { ClinicSearchModal, type ClinicPlaceResult } from "./ClinicSearchModal";
import { ClinicMap } from "./maps/ClinicMap";
import { NavLaunchButtons } from "./NavLaunchButtons";
import { AttachmentLightbox } from "./AttachmentLightbox";
import { EventDetailChip } from "./EventDetailChip";
import { EventAttachmentThumb } from "./EventAttachmentThumb";
import { EventDetailTagPicker } from "./EventDetailTagPicker";
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
  clinicLatitude?: number | null;
  clinicLongitude?: number | null;
  clinicPlaceUrl?: string | null;
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

type ClinicPlace = {
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  placeUrl: string | null;
};

type ClinicSuggestions = {
  lastClinic: ClinicPlace | null;
  frequent: (ClinicPlace & { count: number })[];
};

/** 장소 검색으로 얻은 좌표·상세 URL. 이름을 손으로 고치면 함께 버린다. */
type ClinicPlaceSelection = {
  latitude: number | null;
  longitude: number | null;
  placeUrl: string | null;
};

const NO_CLINIC_PLACE: ClinicPlaceSelection = { latitude: null, longitude: null, placeUrl: null };

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
    setSelectedTagIds: (v: string[]) => void;
    setCustomProductName: (v: string) => void;
    setClinicName: (v: string) => void;
    setClinicAddress: (v: string) => void;
    setClinicPlace: (v: ClinicPlaceSelection) => void;
    setQuantityOffered: (v: string) => void;
    setQuantity: (v: string) => void;
    setUnit: (v: string) => void;
    setNote: (v: string) => void;
    setScaleValue: (v: number | null) => void;
    setRemovedAttachmentIds: (v: string[]) => void;
  },
  detailTags: boolean,
) {
  setters.setOccurredLocal(toDatetimeLocalValue(draft.occurredAt));
  if (detailTags) {
    const parsed = parseProductNameValue(draft.eventTypeKey, draft.productName);
    setters.setSelectedTagIds(parsed.tagIds);
    setters.setCustomProductName(parsed.custom);
    setters.setProductName("");
  } else {
    setters.setProductName(draft.productName ?? "");
    setters.setSelectedTagIds([]);
    setters.setCustomProductName("");
  }
  setters.setClinicName(draft.clinicName ?? "");
  setters.setClinicAddress(draft.clinicAddress ?? "");
  setters.setClinicPlace({
    latitude: draft.clinicLatitude ?? null,
    longitude: draft.clinicLongitude ?? null,
    placeUrl: draft.clinicPlaceUrl ?? null,
  });
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
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [customProductName, setCustomProductName] = useState("");
  const [frequentProducts, setFrequentProducts] = useState<ProductSuggestions["frequent"]>([]);
  const [clinicName, setClinicName] = useState("");
  const [clinicAddress, setClinicAddress] = useState("");
  const [clinicPlace, setClinicPlace] = useState<ClinicPlaceSelection>(NO_CLINIC_PLACE);
  const [clinicSearchOpen, setClinicSearchOpen] = useState(false);
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
  const wantsMaps = open && draft?.eventTypeKey === "vet_visit";
  const mapConfig = useMapProviders(wantsMaps);
  const mapsOn = mapsEnabled(mapConfig);

  const fields = useMemo(
    () => eventDetailFields(draft?.eventTypeKey, draft?.scaleType),
    [draft?.eventTypeKey, draft?.scaleType],
  );

  function resolvedProductName(): string {
    if (fields.detailTags) {
      return encodeProductNameValue(draft?.eventTypeKey, selectedTagIds, customProductName);
    }
    return productName.trim();
  }

  function applyStoredProductName(value: string) {
    if (fields.detailTags) {
      const parsed = parseProductNameValue(draft?.eventTypeKey, value);
      setSelectedTagIds(parsed.tagIds);
      setCustomProductName(parsed.custom);
      return;
    }
    setProductName(value);
  }

  useEffect(() => {
    if (!open || !draft) return;
    resetFormFromDraft(
      draft,
      {
        setOccurredLocal,
        setProductName,
        setSelectedTagIds,
        setCustomProductName,
        setClinicName,
        setClinicAddress,
        setClinicPlace,
        setQuantityOffered,
        setQuantity,
        setUnit,
        setNote,
        setScaleValue,
        setRemovedAttachmentIds,
      },
      fields.detailTags,
    );
    setFrequentProducts([]);
    setFrequentClinics([]);
    setClinicSearchOpen(false);
    setIsEditing(draft.mode === "create" || draft.mode === "edit");
    setLightboxAtt(null);

    if (draft.mode === "create" && draft.petId && draft.eventTypeKey) {
      const prefs = loadEventDetailPrefs(draft.petId, draft.eventTypeKey);
      if (prefs) {
        if (!draft.productName?.trim() && prefs.productName) applyStoredProductName(prefs.productName);
        if (prefs.quantityOffered) setQuantityOffered(prefs.quantityOffered);
        if (prefs.quantity) setQuantity(prefs.quantity);
        if (prefs.unit) setUnit(prefs.unit);
      }
    }
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
        if (draft.mode === "create" && !draft.productName?.trim()) {
          const prefs = loadEventDetailPrefs(draft.petId, eventTypeKey);
          if (!prefs?.productName && data.lastProduct) {
            applyStoredProductName(data.lastProduct);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setFrequentProducts([]);
      });

    return () => {
      cancelled = true;
    };
    // draft를 통째로 의존하면 글자 하나 칠 때마다 추천 API를 다시 부른다 — 쓰는 필드만 넣는다.
    // applyStoredProductName이 읽는 fields는 draft.eventTypeKey의 useMemo라 함께 갱신된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          applyClinicPlace(data.lastClinic);
        }
      })
      .catch(() => {
        if (!cancelled) setFrequentClinics([]);
      });

    return () => {
      cancelled = true;
    };
    // 위와 같은 이유 — draft 전체가 아니라 이 effect가 읽는 필드만 의존한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, syncKey, fields.clinicName, draft?.mode, draft?.petId, draft?.clinicName]);

  // 장소 검색 이전에 자유 텍스트로 적어 둔 병원은 좌표가 없다 — 주소만 있으면 지오코딩해서
  // 지도·내비를 쓸 수 있게 한다. 실패하면 지도 없이 기존 화면 그대로다.
  const [geocodedCoords, setGeocodedCoords] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    setGeocodedCoords(null);
  }, [syncKey]);

  useEffect(() => {
    if (!open || !draft || !fields.clinicName || !mapsOn) return;
    if (draft.clinicLatitude != null && draft.clinicLongitude != null) return;
    const address = draft.clinicAddress?.trim();
    if (!address) return;

    let cancelled = false;
    void geocodeAddress(mapConfig, address)
      .then((res) => {
        if (!cancelled) setGeocodedCoords(res);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, syncKey, mapsOn, mapConfig, fields.clinicName, draft?.clinicAddress, draft?.clinicLatitude, draft?.clinicLongitude]);

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

  const isObservation = draft.eventTypeKey === "observation" || draft.eventTypeKey === "energy";

  const clinicCoords =
    draft.clinicLatitude != null && draft.clinicLongitude != null
      ? { lat: draft.clinicLatitude, lon: draft.clinicLongitude }
      : geocodedCoords;
  const clinicMapName = draft.clinicName?.trim() || "";

  function renderScale3Field() {
    if (!fields.scale3) return null;
    return (
      <div className="event-detail-field">
        <span className="field-label">{t(scale3FieldLabelKey(draft!.scaleType))}</span>
        <div
          className="event-detail-chip-row"
          role="group"
          aria-label={t(scale3FieldLabelKey(draft!.scaleType))}
        >
          {SCALE3_VALUES.map((value) => (
            <EventDetailChip
              key={value}
              selected={scaleValue === value}
              disabled={busy}
              onClick={() => setScaleValue((prev) => (prev === value ? null : value))}
            >
              {t(scale3ValueLabelKey(draft!.scaleType, value))}
            </EventDetailChip>
          ))}
        </div>
      </div>
    );
  }

  function applyQuickTime(key: QuickTimeKey) {
    const iso = resolveQuickTime(key).toISOString();
    setOccurredLocal(toDatetimeLocalValue(iso));
  }

  function handleCancelEdit() {
    if (draft!.mode === "create" || draft!.mode === "edit" || !draft!.eventId) {
      onClose();
      return;
    }
    resetFormFromDraft(
      draft!,
      {
        setOccurredLocal,
        setProductName,
        setSelectedTagIds,
        setCustomProductName,
        setClinicName,
        setClinicAddress,
        setClinicPlace,
        setQuantityOffered,
        setQuantity,
        setUnit,
        setNote,
        setScaleValue,
        setRemovedAttachmentIds,
      },
      fields.detailTags,
    );
    setIsEditing(false);
  }

  function applyClinicPlace(place: ClinicPlace) {
    setClinicName(place.name);
    setClinicAddress(place.address ?? "");
    setClinicPlace({
      latitude: place.latitude,
      longitude: place.longitude,
      placeUrl: place.placeUrl,
    });
  }

  function handleClinicSearchSelect(result: ClinicPlaceResult) {
    applyClinicPlace({
      name: result.name,
      address: result.address || null,
      latitude: result.lat,
      longitude: result.lon,
      placeUrl: result.placeUrl,
    });
    setClinicSearchOpen(false);
  }

  // 이름을 손으로 고치면 검색으로 붙은 좌표는 버린다 — 이름이 곧 Contact의 키라서
  // 그대로 두면 다른 병원에 엉뚱한 좌표가 붙는다.
  function handleClinicNameInput(value: string) {
    setClinicName(value);
    setClinicPlace(NO_CLINIC_PLACE);
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

    const savedProductName = fields.productName ? resolvedProductName() || null : null;

    onSave(
      {
        ...draft,
        occurredAt,
        quantityOffered: fields.quantityOffered ? offered : null,
        quantity: fields.quantity ? consumed : null,
        unit: resolveEventUnit(fields, unit),
        productName: savedProductName,
        clinicName: fields.clinicName ? clinicName.trim() || null : null,
        clinicAddress: fields.clinicAddress ? clinicAddress.trim() || null : null,
        clinicLatitude: fields.clinicName ? clinicPlace.latitude : null,
        clinicLongitude: fields.clinicName ? clinicPlace.longitude : null,
        clinicPlaceUrl: fields.clinicName ? clinicPlace.placeUrl : null,
        note: fields.note ? note.trim() || null : null,
        scaleValue: fields.fecalScale || fields.scale3 ? scaleValue : null,
        needsReview: false,
      },
      { removedAttachmentIds },
    );

    if (draft.petId && draft.eventTypeKey) {
      saveEventDetailPrefs(draft.petId, draft.eventTypeKey, {
        productName: savedProductName,
        quantity: fields.quantity ? quantity : undefined,
        quantityOffered: fields.quantityOffered ? quantityOffered : undefined,
        unit: fields.showUnitInput ? unit : undefined,
      });
    }
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
                {fields.productName &&
                  renderViewValue(
                    t(fields.productNameLabelKey),
                    formatProductNameDisplay(draft.eventTypeKey, draft.productName, t),
                  )}
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
                {fields.note && renderViewValue(t(fields.noteLabelKey), draft.note)}
              </dl>

              {fields.clinicName && clinicMapName && clinicCoords && (
                <section className="event-detail-clinic-map" aria-label={t("clinicMapSection")}>
                  {mapConfig.kakaoAppKey && (
                    <ClinicMap
                      appKey={mapConfig.kakaoAppKey}
                      lat={clinicCoords.lat}
                      lon={clinicCoords.lon}
                      name={clinicMapName}
                    />
                  )}
                  <NavLaunchButtons
                    destination={{ lat: clinicCoords.lat, lon: clinicCoords.lon, name: clinicMapName }}
                  />
                  {draft.clinicPlaceUrl && (
                    <a
                      className="clinic-place-link"
                      href={draft.clinicPlaceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t("clinicPlaceDetailLink")}
                    </a>
                  )}
                </section>
              )}

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
                <div className="event-detail-chip-row event-detail-quick-times">
                  {QUICK_TIME_KEYS.map((key) => (
                    <EventDetailChip
                      key={key}
                      disabled={busy}
                      onClick={() => applyQuickTime(key)}
                    >
                      {t(`quickTime.${key}`)}
                    </EventDetailChip>
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
                <div className="event-detail-field">
                  {fields.productCustomInput ? (
                    <label className="field-label" htmlFor="event-product">
                      {t(fields.productNameLabelKey)}
                    </label>
                  ) : (
                    <span className="field-label">{t(fields.productNameLabelKey)}</span>
                  )}
                  {fields.detailTags && (
                    <EventDetailTagPicker
                      eventTypeKey={draft.eventTypeKey}
                      selectedIds={selectedTagIds}
                      disabled={busy}
                      t={t}
                      onToggle={(tagId) =>
                        setSelectedTagIds((prev) =>
                          toggleProductNameTag(draft.eventTypeKey, prev, tagId),
                        )
                      }
                    />
                  )}
                  {fields.productCustomInput && (
                    <input
                      id="event-product"
                      type="text"
                      className="event-detail-product-input"
                      placeholder={t("eventDetailProductNameCustomPlaceholder")}
                      maxLength={120}
                      value={fields.detailTags ? customProductName : productName}
                      disabled={busy}
                      onChange={(e) =>
                        fields.detailTags
                          ? setCustomProductName(e.target.value)
                          : setProductName(e.target.value)
                      }
                    />
                  )}
                  {frequentProducts.length > 0 && (
                    <div className="event-detail-field">
                      <span className="event-detail-chip-hint">{t("eventDetailFrequentProducts")}</span>
                      <div className="event-detail-chip-row">
                        {frequentProducts.map((item) => (
                          <EventDetailChip
                            key={item.productName}
                            disabled={busy}
                            onClick={() => applyStoredProductName(item.productName)}
                          >
                            {formatProductNameDisplay(draft.eventTypeKey, item.productName, t) ??
                              item.productName}
                          </EventDetailChip>
                        ))}
                      </div>
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
                      <div className="clinic-name-row">
                        <input
                          id="event-clinic-name"
                          type="text"
                          className="event-detail-product-input"
                          placeholder={t("eventDetailClinicNamePlaceholder")}
                          maxLength={120}
                          value={clinicName}
                          disabled={busy}
                          onChange={(e) => handleClinicNameInput(e.target.value)}
                        />
                        {mapsOn && (
                          <button
                            type="button"
                            className="clinic-search-open"
                            disabled={busy}
                            onClick={() => setClinicSearchOpen(true)}
                          >
                            {t("clinicSearchOpenButton")}
                          </button>
                        )}
                      </div>
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
                    <div className="event-detail-field">
                      <span className="event-detail-chip-hint">{t("eventDetailFrequentClinics")}</span>
                      <div className="event-detail-chip-row">
                        {frequentClinics.map((item) => (
                          <EventDetailChip
                            key={`${item.name}|${item.address ?? ""}`}
                            disabled={busy}
                            onClick={() => applyClinicPlace(item)}
                          >
                            {item.address ? `${item.name} · ${item.address}` : item.name}
                          </EventDetailChip>
                        ))}
                      </div>
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

              {isObservation && renderScale3Field()}

              {fields.fecalScale && (
                <div className="event-detail-field">
                  <span className="field-label">{t("eventDetailFecalScore")}</span>
                  <p className="meta event-detail-scale-hint">{t("eventDetailFecalScoreHint")}</p>
                  <div
                    className="event-detail-chip-row"
                    role="group"
                    aria-label={t("eventDetailFecalScore")}
                  >
                    {FECAL_SCORES.map((score) => (
                      <EventDetailChip
                        key={score}
                        selected={scaleValue === score}
                        disabled={busy}
                        onClick={() => setScaleValue((prev) => (prev === score ? null : score))}
                      >
                        {score}
                      </EventDetailChip>
                    ))}
                  </div>
                </div>
              )}

              {!isObservation && fields.scale3 && renderScale3Field()}

              {fields.note && (
                <>
                  <label className="field-label" htmlFor="event-note">
                    {t(fields.noteLabelKey)}
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

      {clinicSearchOpen && (
        <ClinicSearchModal
          mapConfig={mapConfig}
          initialQuery={clinicName}
          onSelect={handleClinicSearchSelect}
          onClose={() => setClinicSearchOpen(false)}
        />
      )}

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
