"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import type { QuickTimeKey } from "@kibble/shared";
import { resolveQuickTime } from "@kibble/shared";
import {
  cancelUploadsForEvent,
  dismissFailedUploadFile,
  getBackgroundUpload,
  retryBackgroundUpload,
  subscribeBackgroundUpload,
} from "../lib/backgroundUpload";
import {
  fromDatetimeLocalValue,
  parseOptionalNumber,
  toDatetimeLocalValue,
} from "../lib/datetimeLocal";
import { apiJson } from "../lib/api";
import { eventDetailFields, formatScaleValuePart, productValueDisplay, quantityPlaceholder, resolveEventUnit, scale3FieldLabelKey, scale3ValueLabelKey } from "../lib/eventDetailFields";
import { loadEventDetailPrefs, saveEventDetailPrefs } from "../lib/eventDetailPrefs";
import {
  encodeProductNameValue,
  formatProductNameDisplay,
  parseProductNameValue,
  toggleProductNameTag,
} from "../lib/eventDetailTags";
import { ProductDetailSheet } from "./ProductDetailSheet";
import { InfoIcon, LightbulbIcon } from "./ProductIcons";
import type { EventAttachment, Product, ProductSummary, Species } from "../lib/types";
import { intlLocale, type TranslationKey } from "../lib/i18n/translations";
import type { AttachmentUploadProgress } from "../lib/eventAttachments";
import { eventAuditParts } from "../lib/eventDisplay";
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
import { QuantityStepper } from "./QuantityStepper";
import {
  COST_KRW_STEP_LARGE,
  costStepperSteps,
  quantityExtraStep,
  quantityStepperSteps,
} from "../lib/quantityStep";

/**
 * 같이 준 제품 한 항목 — 첫 제품은 시트의 기본 칸(제품·양·단위)이 맡고, 둘째부터 이 배열이다.
 * 저장하면 항목마다 이벤트 한 건이 되고 같은 `entryId`로 묶인다 (§7.22).
 */
export interface ExtraProductItem {
  productId: string | null;
  productName: string;
  dosage: string | null;
  quantity: string;
  quantityOffered: string;
  unit: string;
}

export interface ExtraProductSave {
  productId: string | null;
  productName: string;
  quantity: number | null;
  quantityOffered: number | null;
  unit: string | null;
}

export interface EventDetailSaveMeta {
  removedAttachmentIds: string[];
  /** 둘째 제품부터 — create 모드의 영양·사료·간식에서만 채워진다 */
  extraItems: ExtraProductSave[];
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
  productId?: string | null;
  product?: ProductSummary | null;
  productName: string | null;
  clinicName: string | null;
  clinicAddress: string | null;
  clinicLatitude?: number | null;
  clinicLongitude?: number | null;
  clinicPlaceUrl?: string | null;
  costKrw: number | null;
  note: string | null;
  scaleType?: string | null;
  scaleValue?: number | null;
  rawText?: string;
  entryId?: string;
  dedupeKey?: string;
  medicationCourseId?: string | null;
  doseSlotIndex?: number | null;
  /** 처방에 적어 둔 1회 용량. 이 기록의 값이 아니라 과정의 값이라 읽기 전용이다 */
  doseAmount?: string | null;
  /** 투약 회차 — 기록할 때 찍힌 값. 비어 있을 수 있다(이 기능 이전 기록) */
  doseOrdinal?: number | null;
  /** 처방에 입력한 총 횟수. 회차 옆 "n/N"과 남은 횟수의 근거 */
  doseTotal?: number | null;
  needsReview?: boolean;
  /** 조회용 메타 — 수정 대상이 아니다. view 모드 하단에 "작성자 · 최종 수정"으로만 쓰인다. */
  createdAt?: string;
  updatedAt?: string;
  createdByName?: string | null;
  updatedByName?: string | null;
}

interface EventDetailSheetProps {
  open: boolean;
  draft: EventDetailDraft | null;
  saving: boolean;
  attachments?: EventAttachment[];
  pendingFiles?: File[];
  onPendingFilesChange?: (files: File[]) => void;
  uploadProgress?: AttachmentUploadProgress | null;
  onDeleteEvent?: () => void;
  deleting?: boolean;
  onClose: () => void;
  onSave: (draft: EventDetailDraft, meta: EventDetailSaveMeta) => void;
  onValidationError: (message: string) => void;
  saveError?: string | null;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  locale?: "ko" | "en";
  /** 종별 태그(모래 갈이·패드 교체)를 거른다. 모르면 전부 보인다 */
  petSpecies?: Species | null;
}

const QUICK_TIME_KEYS: QuickTimeKey[] = ["now", "oneHourAgo", "yesterdayEvening"];
const FECAL_SCORES = [1, 2, 3, 4, 5, 6, 7] as const;
const SCALE3_VALUES = [1, 2, 3] as const;

export type ActiveProductSuggestion = {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  dosage: string | null;
  isActive: boolean;
};

type LastProductItem = {
  productId: string | null;
  productName: string | null;
  dosage: string | null;
  quantity: number | null;
  quantityOffered: number | null;
  unit: string | null;
};

type ProductSuggestions = {
  lastProduct: string | null;
  lastProductId: string | null;
  lastProductDosage?: string | null;
  /** 마지막 묶음의 항목들 — 첫 항목이 `lastProduct*`와 같다 */
  lastItems?: LastProductItem[];
  activeProducts: ActiveProductSuggestion[];
  frequent: { productName: string; count: number }[];
};

function numberToInput(value: number | null | undefined): string {
  return value != null ? String(value) : "";
}

function lastItemToExtra(item: LastProductItem): ExtraProductItem {
  return {
    productId: item.productId,
    productName: item.productName ?? "",
    dosage: item.dosage,
    quantity: numberToInput(item.quantity),
    quantityOffered: numberToInput(item.quantityOffered),
    unit: item.unit ?? "",
  };
}

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
  return d.toLocaleString(intlLocale(locale), {
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
    setProductId: (v: string | null) => void;
    setProductDosage: (v: string | null) => void;
    setProductName: (v: string) => void;
    setSelectedTagIds: (v: string[]) => void;
    setCustomProductName: (v: string) => void;
    setClinicName: (v: string) => void;
    setClinicAddress: (v: string) => void;
    setClinicPlace: (v: ClinicPlaceSelection) => void;
    setCostKrw: (v: string) => void;
    setQuantityOffered: (v: string) => void;
    setQuantity: (v: string) => void;
    setUnit: (v: string) => void;
    setNote: (v: string) => void;
    setScaleValue: (v: number | null) => void;
    setDoseOrdinal: (v: string) => void;
    setRemovedAttachmentIds: (v: string[]) => void;
  },
  detailTags: boolean,
) {
  setters.setOccurredLocal(toDatetimeLocalValue(draft.occurredAt));
  setters.setProductId(draft.productId ?? draft.product?.id ?? null);
  setters.setProductDosage(draft.product?.dosage ?? null);
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
  setters.setCostKrw(draft.costKrw != null ? String(draft.costKrw) : "");
  setters.setQuantityOffered(draft.quantityOffered != null ? String(draft.quantityOffered) : "");
  setters.setQuantity(draft.quantity != null ? String(draft.quantity) : "");
  setters.setUnit(draft.unit ?? "");
  setters.setNote(draft.note ?? "");
  setters.setScaleValue(draft.scaleValue ?? null);
  setters.setDoseOrdinal(draft.doseOrdinal != null ? String(draft.doseOrdinal) : "");
  setters.setRemovedAttachmentIds([]);
}

function FailedFileThumb({ file, name }: { file?: File; name: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="event-detail-failed-thumb"
      />
    );
  }

  return (
    <span className="event-detail-failed-icon-wrap" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="event-detail-failed-svg"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    </span>
  );
}

export function EventDetailSheet({
  open,
  draft,
  saving,
  attachments = [],
  pendingFiles = [],
  onPendingFilesChange,
  uploadProgress = null,
  onDeleteEvent,
  deleting = false,
  onClose,
  onSave,
  onValidationError,
  saveError,
  t,
  locale = "ko",
  petSpecies = null,
}: EventDetailSheetProps) {
  const [occurredLocal, setOccurredLocal] = useState("");
  const [productId, setProductId] = useState<string | null>(null);
  const [productDosage, setProductDosage] = useState<string | null>(null);
  const [extraItems, setExtraItems] = useState<ExtraProductItem[]>([]);
  const [activeProducts, setActiveProducts] = useState<ActiveProductSuggestion[]>([]);
  const [popupProduct, setPopupProduct] = useState<Product | null>(null);
  const [productName, setProductName] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [customProductName, setCustomProductName] = useState("");
  const [frequentProducts, setFrequentProducts] = useState<ProductSuggestions["frequent"]>([]);
  const [clinicName, setClinicName] = useState("");
  const [clinicAddress, setClinicAddress] = useState("");
  const [clinicPlace, setClinicPlace] = useState<ClinicPlaceSelection>(NO_CLINIC_PLACE);
  const [clinicSearchOpen, setClinicSearchOpen] = useState(false);
  const [costKrw, setCostKrw] = useState("");
  const [frequentClinics, setFrequentClinics] = useState<ClinicSuggestions["frequent"]>([]);
  const [quantityOffered, setQuantityOffered] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [note, setNote] = useState("");
  const [scaleValue, setScaleValue] = useState<number | null>(null);
  const [doseOrdinal, setDoseOrdinal] = useState("");
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [lightboxAtt, setLightboxAtt] = useState<EventAttachment | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const busy = saving || deleting;
  const syncKey = draftSyncKey(draft);
  const wantsMaps = open && draft?.eventTypeKey === "vet_visit";
  const mapConfig = useMapProviders(wantsMaps);
  const mapsOn = mapsEnabled(mapConfig);

  const bgSnapshot = useSyncExternalStore(
    subscribeBackgroundUpload,
    getBackgroundUpload,
    () => null,
  );
  const currentEventId = draft?.eventId;
  const failedUploadItem = useMemo(
    () => (currentEventId ? bgSnapshot?.failedItems?.find((item) => item.eventId === currentEventId) : undefined),
    [bgSnapshot?.failedItems, currentEventId],
  );
  const failedUploadFiles = failedUploadItem?.failedFiles ?? [];

  const fields = useMemo(
    () => eventDetailFields(draft?.eventTypeKey, draft?.scaleType),
    [draft?.eventTypeKey, draft?.scaleType],
  );
  const qtyUnit = unit || fields.defaultUnit;
  const qtySteps = quantityStepperSteps(qtyUnit, draft?.eventTypeKey);
  const qtyExtraStep = quantityExtraStep(qtyUnit, draft?.eventTypeKey);
  // 여러 제품은 새 기록에서만 — 이미 저장된 행은 각자 한 제품이라 그 행만 고친다
  const multiProduct = fields.multiProduct && draft?.mode === "create";

  function formatQtyStep(step: number, steps: number[]): string {
    if (step === 10000) return t("qtyStep10000");
    if (step === 1000) return t("qtyStep1000");
    if (step === 1 && steps.includes(0.1)) return "1.0";
    return String(step);
  }

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

  function selectActiveProduct(item: ActiveProductSuggestion) {
    if (productId === item.id) {
      // 첫 제품을 빼면 둘째가 첫 칸으로 올라온다 — 값(양·단위)도 같이 옮겨서 칸이 비지 않는다
      const [next, ...rest] = extraItems;
      if (multiProduct && next) {
        setProductId(next.productId);
        setProductDosage(next.dosage);
        setProductName(next.productName);
        setQuantity(next.quantity);
        setQuantityOffered(next.quantityOffered);
        setUnit(next.unit);
        setExtraItems(rest);
        return;
      }
      setProductId(null);
      setProductDosage(null);
      if (!fields.detailTags) setProductName("");
      return;
    }
    if (multiProduct && extraItems.some((x) => x.productId === item.id)) {
      setExtraItems((prev) => prev.filter((x) => x.productId !== item.id));
      return;
    }
    // 첫 칸이 차 있으면 둘째 이후로 붙는다. 첫 칸의 양·단위는 그대로 — 각 제품의 양은 따로다 (§7.22)
    if (multiProduct && (productId || productName.trim())) {
      setExtraItems((prev) => [
        ...prev,
        {
          productId: item.id,
          productName: item.name,
          dosage: item.dosage ?? null,
          quantity: "",
          quantityOffered: "",
          unit: "",
        },
      ]);
      return;
    }
    setProductId(item.id);
    setProductDosage(item.dosage ?? null);
    // 태그 타입(관리)은 productName이 slug 목록이라 제품 이름을 쓰지 않는다 — 태그는 그대로 (§7.20)
    if (!fields.detailTags) applyStoredProductName(item.name);
  }

  function updateExtraItem(index: number, patch: Partial<ExtraProductItem>) {
    setExtraItems((prev) => prev.map((x, i) => (i === index ? { ...x, ...patch } : x)));
  }

  function removeExtraItem(index: number) {
    setExtraItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleOpenProductPopup(targetIdInput?: string | null) {
    const targetId = targetIdInput ?? productId ?? draft?.productId ?? draft?.product?.id;
    if (!targetId) return;
    try {
      const res = await apiJson<Product>(`/api/products/${targetId}`);
      if (res?.id) {
        setPopupProduct(res);
      }
    } catch {
      // fallback
    }
  }

  useEffect(() => {
    if (!open || !draft) return;
    resetFormFromDraft(
      draft,
      {
        setOccurredLocal,
        setProductId,
        setProductDosage,
        setProductName,
        setSelectedTagIds,
        setCustomProductName,
        setClinicName,
        setClinicAddress,
        setClinicPlace,
        setCostKrw,
        setQuantityOffered,
        setQuantity,
        setUnit,
        setNote,
        setScaleValue,
        setDoseOrdinal,
        setRemovedAttachmentIds,
      },
      fields.detailTags,
    );
    setExtraItems([]);
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
        // 지난 세트의 둘째 이후. 복용법 힌트는 서버 제품 목록이 오면 붙는다
        if (fields.multiProduct && !draft.productName?.trim() && prefs.extraItems?.length) {
          setExtraItems(
            prefs.extraItems.map((x) => ({
              productId: x.productId ?? null,
              productName: x.productName ?? "",
              dosage: null,
              quantity: x.quantity ?? "",
              quantityOffered: x.quantityOffered ?? "",
              unit: x.unit ?? "",
            })),
          );
        }
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
        if (data.activeProducts) {
          setActiveProducts(data.activeProducts);
        }
        if (draft.mode === "create" && !draft.productName?.trim() && !draft.productId) {
          const prefs = loadEventDetailPrefs(draft.petId, eventTypeKey);
          if (!prefs?.productName) {
            if (data.lastProductId) {
              setProductId(data.lastProductId);
              if (data.lastProduct) applyStoredProductName(data.lastProduct);
              if (data.lastProductDosage) setProductDosage(data.lastProductDosage);
            } else if (data.lastProduct) {
              applyStoredProductName(data.lastProduct);
            }
            // 이 기기에 저장값이 없으면 지난 세트(양·단위까지)를 서버에서 그대로 연다 (§7.22).
            // 응답이 오기 전에 사용자가 칩을 골랐으면 그쪽이 우선 — 덮어쓰지 않는다
            const [first, ...rest] = data.lastItems ?? [];
            if (fields.multiProduct && first) {
              if (first.quantity != null) setQuantity(numberToInput(first.quantity));
              if (first.quantityOffered != null) setQuantityOffered(numberToInput(first.quantityOffered));
              if (first.unit) setUnit(first.unit);
              setExtraItems((prev) => (prev.length > 0 ? prev : rest.map(lastItemToExtra)));
            }
          } else if (fields.multiProduct && prefs.extraItems === undefined) {
            // 이 기능 전에 저장된 로컬값(첫 제품만) — 서버의 지난 세트가 같은 제품으로 시작하면
            // 둘째 이후를 거기서 가져온다. 다른 제품이면 로컬값을 존중해 한 제품으로 둔다
            const [first, ...rest] = data.lastItems ?? [];
            if (first && rest.length > 0 && first.productName === prefs.productName) {
              setExtraItems((prev) => (prev.length > 0 ? prev : rest.map(lastItemToExtra)));
            }
          } else if (fields.multiProduct && prefs.extraItems?.length) {
            // 로컬 저장값의 둘째 이후에 복용법 힌트를 서버 제품 목록에서 붙인다
            const dosageById = new Map((data.activeProducts ?? []).map((p) => [p.id, p.dosage ?? null]));
            setExtraItems((prev) =>
              prev.map((x) => (x.productId ? { ...x, dosage: dosageById.get(x.productId) ?? x.dosage } : x)),
            );
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFrequentProducts([]);
          setActiveProducts([]);
        }
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
  const auditParts = eventAuditParts(draft, t, locale);

  // 회차와 남은 횟수. 총 횟수를 안 넣은 처방이면 회차만 보여준다.
  const doseOrdinalView = (() => {
    if (draft.doseOrdinal == null) return null;
    const total = draft.doseTotal ?? null;
    if (total == null) return String(draft.doseOrdinal);
    const left = Math.max(0, total - draft.doseOrdinal);
    return `${draft.doseOrdinal} / ${total} · ${t("careDosesRemaining", { count: left })}`;
  })();

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
          {SCALE3_VALUES.map((value) => {
            const labelKey = scale3ValueLabelKey(draft!.scaleType, value);
            return (
              <EventDetailChip
                key={value}
                selected={scaleValue === value}
                disabled={busy}
                onClick={() => setScaleValue((prev) => (prev === value ? null : value))}
              >
                {labelKey ? t(labelKey) : value}
              </EventDetailChip>
            );
          })}
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
        setProductId,
        setProductDosage,
        setProductName,
        setSelectedTagIds,
        setCustomProductName,
        setClinicName,
        setClinicAddress,
        setClinicPlace,
        setCostKrw,
        setQuantityOffered,
        setQuantity,
        setUnit,
        setNote,
        setScaleValue,
        setDoseOrdinal,
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

    let cost: number | null = null;
    if (fields.cost) {
      const parsed = parseOptionalNumber(costKrw.replace(/,/g, ""));
      if (!parsed.ok || (parsed.value != null && parsed.value < 0)) {
        onValidationError(t("eventDetailCostInvalid"));
        return;
      }
      cost = parsed.value != null ? Math.round(parsed.value) : null;
    }

    // 회차는 투약 과정에 매인 기록만 갖는다. 비우면 번호 없는 기록으로 되돌린다.
    let ordinal: number | null = draft.doseOrdinal ?? null;
    if (draft.medicationCourseId) {
      const parsed = parseOptionalNumber(doseOrdinal);
      if (!parsed.ok || (parsed.value != null && parsed.value < 1)) {
        onValidationError(t("eventDetailDoseOrdinalInvalid"));
        return;
      }
      ordinal = parsed.value != null ? Math.round(parsed.value) : null;
    }

    let savedProductName = fields.productName ? resolvedProductName() || null : null;
    let savedProductId = productId;
    let unitForSave = unit;

    // 둘째 제품부터 — 제품도 이름도 없는 빈 줄은 조용히 버린다 (K-12). 숫자가 아닌 양만 막는다
    const extras: ExtraProductSave[] = [];
    if (multiProduct) {
      let items = extraItems.filter((x) => x.productId || x.productName.trim());
      // 첫 칸이 비었는데(제품·이름·양 전부 없음) 둘째가 있으면 둘째를 첫 칸으로 올린다 —
      // 안 그러면 내용 없는 이벤트가 한 건 앞에 붙는다
      if (!savedProductId && !savedProductName && consumed == null && offered == null && items.length > 0) {
        const [first, ...rest] = items;
        const qty = parseOptionalNumber(first.quantity);
        const off = fields.quantityOffered
          ? parseOptionalNumber(first.quantityOffered)
          : { ok: true as const, value: null };
        if (!qty.ok || !off.ok) {
          onValidationError(t("eventDetailQuantityInvalid"));
          return;
        }
        savedProductId = first.productId;
        savedProductName = first.productName.trim() || null;
        consumed = qty.value;
        offered = fields.quantityOffered ? off.value : null;
        unitForSave = first.unit;
        items = rest;
      }
      for (const item of items) {
        const qty = parseOptionalNumber(item.quantity);
        const off = fields.quantityOffered
          ? parseOptionalNumber(item.quantityOffered)
          : { ok: true as const, value: null };
        if (!qty.ok || !off.ok) {
          onValidationError(t("eventDetailQuantityInvalid"));
          return;
        }
        extras.push({
          productId: item.productId,
          productName: item.productName.trim(),
          quantity: qty.value,
          quantityOffered: fields.quantityOffered ? off.value : null,
          unit: resolveEventUnit(fields, item.unit),
        });
      }
    }

    onSave(
      {
        ...draft,
        occurredAt,
        quantityOffered: fields.quantityOffered ? offered : null,
        quantity: fields.quantity ? consumed : null,
        unit: resolveEventUnit(fields, unitForSave),
        productId: fields.productName ? savedProductId : null,
        productName: savedProductName,
        clinicName: fields.clinicName ? clinicName.trim() || null : null,
        clinicAddress: fields.clinicAddress ? clinicAddress.trim() || null : null,
        clinicLatitude: fields.clinicName ? clinicPlace.latitude : null,
        clinicLongitude: fields.clinicName ? clinicPlace.longitude : null,
        clinicPlaceUrl: fields.clinicName ? clinicPlace.placeUrl : null,
        costKrw: fields.cost ? cost : null,
        note: fields.note ? note.trim() || null : null,
        scaleValue: fields.fecalScale || fields.scale3 ? scaleValue : null,
        doseOrdinal: ordinal,
        needsReview: false,
      },
      { removedAttachmentIds, extraItems: extras },
    );

    if (draft.petId && draft.eventTypeKey) {
      // 저장한 값 그대로 기억한다 — 첫 칸이 승격됐으면 승격된 뒤의 모양이다
      saveEventDetailPrefs(draft.petId, draft.eventTypeKey, {
        productName: savedProductName,
        quantity: fields.quantity ? numberToInput(consumed) : undefined,
        quantityOffered: fields.quantityOffered ? numberToInput(offered) : undefined,
        unit: fields.showUnitInput ? unitForSave : undefined,
        ...(fields.multiProduct
          ? {
              extraItems: extras.map((x) => ({
                productId: x.productId,
                productName: x.productName,
                quantity: numberToInput(x.quantity),
                quantityOffered: numberToInput(x.quantityOffered),
                unit: x.unit ?? "",
              })),
            }
          : {}),
      });
    }
  }

  function renderViewValue(label: string, value: React.ReactNode) {
    if (value === null || value === undefined || value === "") return null;
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
                    draft.product || draft.productId ? (
                      <span className="event-detail-product-value">
                        <span>
                          {productValueDisplay(
                            fields.detailTags,
                            formatProductNameDisplay(draft.eventTypeKey, draft.productName, t),
                            draft.product?.name ?? null,
                          )}
                        </span>
                        <button
                          type="button"
                          className="product-info-trigger-btn"
                          onClick={() => handleOpenProductPopup(draft.productId ?? draft.product?.id)}
                          title={t("productDetailTitle")}
                        >
                          <InfoIcon size={13} />
                          <span>{t("productViewDetail")}</span>
                        </button>
                      </span>
                    ) : (
                      formatProductNameDisplay(draft.eventTypeKey, draft.productName, t)
                    ),
                  )}
                {fields.clinicName && renderViewValue(t("eventDetailClinicName"), draft.clinicName)}
                {fields.clinicAddress && renderViewValue(t("eventDetailClinicAddress"), draft.clinicAddress)}
                {fields.cost &&
                  renderViewValue(
                    t("eventDetailCost"),
                    draft.costKrw != null ? `${draft.costKrw.toLocaleString()}${t("eventDetailCostUnit")}` : null,
                  )}
                {renderViewValue(t("eventDetailDoseAmountLabel"), draft.doseAmount)}
                {renderViewValue(t("eventDetailDoseOrdinalLabel"), doseOrdinalView)}
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

              {(attachments.length > 0 || failedUploadFiles.length > 0) && (
                <section className="event-detail-view-attachments" aria-label={t("eventDetailAttachments")}>
                  <h3 className="field-label">{t("eventDetailAttachments")}</h3>
                  <ul className="event-detail-view-attachments-list">
                    {attachments.map((att) => (
                      <li key={att.id}>
                        <button
                          type="button"
                          className="event-detail-view-att-btn"
                          onClick={() => flushSync(() => setLightboxAtt(att))}
                        >
                          <EventAttachmentThumb
                            path={att.path}
                            mime={att.mime}
                            posterPath={att.posterPath}
                            transcodeStatus={att.transcodeStatus}
                            alt=""
                            className="attachment-thumb attachment-thumb-large"
                          />
                          <span className="attachment-thumb-hit" aria-hidden />
                          {att.mime.startsWith("video/") && (
                            <span className="attachment-video-badge attachment-video-badge-large" aria-hidden />
                          )}
                        </button>
                      </li>
                    ))}
                    {failedUploadFiles.map((f, fi) => (
                      <li key={`failed-${fi}`} className="event-detail-failed-attachment-item">
                        <div className="event-detail-failed-box">
                          <FailedFileThumb file={f.file} name={f.name} />
                          <div className="event-detail-failed-info">
                            <span className="event-detail-failed-name" title={f.name}>
                              {f.name}
                            </span>
                            <span className="event-detail-failed-tag">{t("attachmentUploadFailedBadge")}</span>
                          </div>
                          <div className="event-detail-failed-actions">
                            <button
                              type="button"
                              className="btn-action"
                              onClick={() => currentEventId && dismissFailedUploadFile(currentEventId, f.name)}
                            >
                              {t("attachmentUploadExclude")}
                            </button>
                            <button
                              type="button"
                              className="btn-action"
                              onClick={() => currentEventId && retryBackgroundUpload(currentEventId)}
                            >
                              {t("attachmentUploadRetry")}
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {auditParts.length > 0 && (
                <p className="event-detail-audit meta">{auditParts.join(" · ")}</p>
              )}

              <div className="form-actions">
                <button type="button" className="secondary" disabled={busy} onClick={onClose}>
                  {t("close")}
                </button>
                {draft.eventId && (
                  <button type="button" disabled={busy} onClick={() => setIsEditing(true)}>
                    {t("edit")}
                  </button>
                )}
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
                      species={petSpecies}
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
                  {activeProducts.length > 0 && (
                    <div className="product-registered-section">
                      <span className="event-detail-chip-hint">
                        {t(multiProduct ? "productSelectRegisteredMulti" : "productSelectRegistered")}
                      </span>
                      <div className="product-quick-chips-row">
                        {activeProducts.map((p) => {
                          const isSelected =
                            productId === p.id ||
                            (multiProduct && extraItems.some((x) => x.productId === p.id));
                          return (
                            <div key={p.id} className="product-quick-chip-wrap">
                              <button
                                type="button"
                                className={`product-quick-chip ${isSelected ? "selected" : ""}`}
                                disabled={busy}
                                onClick={() => selectActiveProduct(p)}
                              >
                                <span className="chip-name">{p.name}</span>
                              </button>
                              {isSelected && (
                                <button
                                  type="button"
                                  className="chip-info-btn"
                                  title={t("productDetailTitle")}
                                  aria-label={`${p.name} ${t("productDetailTitle")}`}
                                  disabled={busy}
                                  onClick={() => handleOpenProductPopup(p.id)}
                                >
                                  <InfoIcon size={12} />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {productDosage && (
                        <div className="product-dosage-hint">
                          <span className="dosage-icon">
                            <LightbulbIcon size={13} />
                          </span>
                          <span className="dosage-text">{t("productDetailDosageHint", { dosage: productDosage })}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {fields.productCustomInput && (
                    <input
                      id="event-product"
                      type="text"
                      className="event-detail-product-input"
                      placeholder={productId ? t("productOrDirectInput") : t("eventDetailProductNameCustomPlaceholder")}
                      maxLength={120}
                      value={fields.detailTags ? customProductName : productName}
                      disabled={busy}
                      onChange={(e) => {
                        setProductId(null);
                        setProductDosage(null);
                        if (fields.detailTags) {
                          setCustomProductName(e.target.value);
                        } else {
                          setProductName(e.target.value);
                        }
                      }}
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
                            onClick={() => {
                              setProductId(null);
                              setProductDosage(null);
                              applyStoredProductName(item.productName);
                            }}
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

              {fields.cost && (
                <div className="event-detail-field">
                  <label className="field-label" htmlFor="event-cost">
                    {t("eventDetailCost")}
                  </label>
                  <QuantityStepper
                    id="event-cost"
                    value={costKrw}
                    onChange={setCostKrw}
                    steps={costStepperSteps()}
                    extraStep={COST_KRW_STEP_LARGE}
                    disabled={busy}
                    placeholder={t("eventDetailCostPlaceholder")}
                    inputMode="numeric"
                    decreaseLabel={t("qtyDecreaseField", { field: t("eventDetailCost") })}
                    increaseLabel={t("qtyIncreaseField", { field: t("eventDetailCost") })}
                    formatStep={formatQtyStep}
                  />
                </div>
              )}

              {draft.medicationCourseId && (
                <div className="event-detail-field">
                  <label className="field-label" htmlFor="event-dose-ordinal">
                    {t("eventDetailDoseOrdinalLabel")}
                  </label>
                  <input
                    id="event-dose-ordinal"
                    type="number"
                    className="event-detail-qty-input"
                    min={1}
                    max={9999}
                    step={1}
                    inputMode="numeric"
                    value={doseOrdinal}
                    onChange={(e) => setDoseOrdinal(e.target.value)}
                    disabled={busy}
                  />
                  <p className="meta">{t("eventDetailDoseOrdinalHint")}</p>
                </div>
              )}

              {(fields.quantityOffered || fields.quantity) && (
                <div className="event-detail-qty-row">
                  {fields.quantityOffered && (
                    <div>
                      <label className="field-label" htmlFor="event-qty-offered">
                        {t(fields.quantityOfferedLabelKey)}
                      </label>
                      <QuantityStepper
                        id="event-qty-offered"
                        value={quantityOffered}
                        onChange={setQuantityOffered}
                        steps={qtySteps}
                        extraStep={qtyExtraStep}
                        disabled={busy}
                        placeholder="100"
                        decreaseLabel={t("qtyDecreaseField", { field: t(fields.quantityOfferedLabelKey) })}
                        increaseLabel={t("qtyIncreaseField", { field: t(fields.quantityOfferedLabelKey) })}
                        formatStep={formatQtyStep}
                      />
                    </div>
                  )}
                  {fields.quantity && (
                    <div>
                      <label className="field-label" htmlFor="event-qty-consumed">
                        {t(fields.quantityLabelKey)}
                      </label>
                      <QuantityStepper
                        id="event-qty-consumed"
                        value={quantity}
                        onChange={setQuantity}
                        steps={qtySteps}
                        extraStep={qtyExtraStep}
                        disabled={busy}
                        placeholder={quantityPlaceholder(draft.eventTypeKey, fields.quantityOffered)}
                        decreaseLabel={t("qtyDecreaseField", { field: t(fields.quantityLabelKey) })}
                        increaseLabel={t("qtyIncreaseField", { field: t(fields.quantityLabelKey) })}
                        formatStep={formatQtyStep}
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

              {multiProduct && extraItems.length > 0 && (
                <div className="event-detail-extra-items">
                  <span className="event-detail-chip-hint">{t("eventDetailExtraItemsHint")}</span>
                  {extraItems.map((item, index) => {
                    const itemUnit = item.unit || fields.defaultUnit;
                    const itemSteps = quantityStepperSteps(itemUnit, draft.eventTypeKey);
                    const itemExtraStep = quantityExtraStep(itemUnit, draft.eventTypeKey);
                    const key = item.productId ?? `custom-${index}`;
                    return (
                      <div key={key} className="event-detail-extra-item">
                        <div className="event-detail-extra-item-head">
                          <span className="event-detail-extra-item-name">{item.productName}</span>
                          <button
                            type="button"
                            className="event-detail-extra-item-remove"
                            aria-label={t("eventDetailExtraItemRemove", { name: item.productName })}
                            title={t("eventDetailExtraItemRemove", { name: item.productName })}
                            disabled={busy}
                            onClick={() => removeExtraItem(index)}
                          >
                            ×
                          </button>
                        </div>
                        {item.dosage && (
                          <div className="product-dosage-hint">
                            <span className="dosage-icon">
                              <LightbulbIcon size={13} />
                            </span>
                            <span className="dosage-text">{t("productDetailDosageHint", { dosage: item.dosage })}</span>
                          </div>
                        )}
                        <div className="event-detail-qty-row">
                          {fields.quantityOffered && (
                            <div>
                              <label className="field-label" htmlFor={`event-extra-${index}-offered`}>
                                {t(fields.quantityOfferedLabelKey)}
                              </label>
                              <QuantityStepper
                                id={`event-extra-${index}-offered`}
                                value={item.quantityOffered}
                                onChange={(v) => updateExtraItem(index, { quantityOffered: v })}
                                steps={itemSteps}
                                extraStep={itemExtraStep}
                                disabled={busy}
                                placeholder="100"
                                decreaseLabel={t("qtyDecreaseField", { field: t(fields.quantityOfferedLabelKey) })}
                                increaseLabel={t("qtyIncreaseField", { field: t(fields.quantityOfferedLabelKey) })}
                                formatStep={formatQtyStep}
                              />
                            </div>
                          )}
                          <div>
                            <label className="field-label" htmlFor={`event-extra-${index}-qty`}>
                              {t(fields.quantityLabelKey)}
                            </label>
                            <QuantityStepper
                              id={`event-extra-${index}-qty`}
                              value={item.quantity}
                              onChange={(v) => updateExtraItem(index, { quantity: v })}
                              steps={itemSteps}
                              extraStep={itemExtraStep}
                              disabled={busy}
                              placeholder={quantityPlaceholder(draft.eventTypeKey, fields.quantityOffered)}
                              decreaseLabel={t("qtyDecreaseField", { field: t(fields.quantityLabelKey) })}
                              increaseLabel={t("qtyIncreaseField", { field: t(fields.quantityLabelKey) })}
                              formatStep={formatQtyStep}
                            />
                          </div>
                        </div>
                        <label className="field-label" htmlFor={`event-extra-${index}-unit`}>
                          {t("eventDetailUnit")}
                        </label>
                        <input
                          id={`event-extra-${index}-unit`}
                          type="text"
                          className="event-detail-unit"
                          placeholder={fields.defaultUnit ?? "g"}
                          maxLength={32}
                          value={item.unit}
                          disabled={busy}
                          onChange={(e) => updateExtraItem(index, { unit: e.target.value })}
                        />
                      </div>
                    );
                  })}
                </div>
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
                            onClick={() => flushSync(() => setLightboxAtt(att))}
                          >
                            <EventAttachmentThumb
                              path={att.path}
                              mime={att.mime}
                              posterPath={att.posterPath}
                              transcodeStatus={att.transcodeStatus}
                              alt=""
                              className="attachment-thumb attachment-thumb-large"
                            />
                            <span className="attachment-thumb-hit" aria-hidden />
                            {att.mime.startsWith("video/") && (
                              <span className="attachment-video-badge attachment-video-badge-large" aria-hidden />
                            )}
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
                      progress={uploadProgress}
                      t={t}
                    />
                  )}
                </fieldset>
              )}

              {saveError && <p className="error-text event-detail-save-error">{saveError}</p>}
              <div className="form-actions">
                {draft.eventId && onDeleteEvent && (
                  <button type="button" className="danger" disabled={busy} onClick={onDeleteEvent}>
                    {deleting ? t("deleting") : t("eventDetailDelete")}
                  </button>
                )}
                <button type="button" className="secondary" disabled={busy} onClick={handleCancelEdit}>
                  {t("cancel")}
                </button>
                <button type="submit" disabled={busy}>
                  {saving ? t("saving") : t("save")}
                </button>
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
          resetLabel={t("lightboxResetZoom")}
        />
      )}

      {popupProduct && (
        <ProductDetailSheet
          open={Boolean(popupProduct)}
          product={popupProduct}
          onClose={() => setPopupProduct(null)}
        />
      )}
    </>
  );
}
