import { formatProductNameDisplay, productNameFieldLabelKey } from "./eventDetailTags";
import type { TranslationKey } from "./i18n/translations";
export type EventDetailFieldFlags = {
  productName: boolean;
  /** 사료 원재료·구토 종류·관찰 항목 등 태그 칩 */
  detailTags: boolean;
  /** 태그 외 직접 입력란 (관찰은 메모로 대체) */
  productCustomInput: boolean;
  productNameLabelKey: TranslationKey;
  noteLabelKey: TranslationKey;
  clinicName: boolean;
  clinicAddress: boolean;
  cost: boolean;
  quantityOffered: boolean;
  quantity: boolean;
  /** 단위 입력란 노출 (기본 단위만 쓰는 타입은 false) */
  showUnitInput: boolean;
  /**
   * 등록 제품을 여러 개 골라 항목마다 양·단위를 적고 이벤트 N건을 같은 `entryId`로 만든다 (§7.22).
   * 영양·사료·간식만 — 상비는 처방·투약 축과 얽혀 따로 본다.
   */
  multiProduct: boolean;
  /**
   * 마지막 제품 연결(productId)을 다음 기록에 그대로 채우는 타입. 관리는 false — 지난 관리(모래)와
   * 이번 관리(양치)는 다른 일이라 엉뚱한 제품이 붙는다 (R149). 체온은 하는 일이 하나라 true (§7.23)
   */
  rememberLastProduct: boolean;
  fecalScale: boolean;
  scale3: boolean;
  note: boolean;
  quantityLabelKey: EventDetailQuantityLabelKey;
  quantityOfferedLabelKey: "eventDetailQuantityOffered";
  defaultUnit: string | null;
};

export type EventDetailQuantityLabelKey =
  | "eventDetailQuantity"
  | "eventDetailQuantityConsumed"
  | "eventDetailWeight"
  | "eventDetailTemperature"
  | "eventDetailVolume"
  | "eventDetailDuration";

const NOTE_ONLY: EventDetailFieldFlags = {
  productName: false,
  detailTags: false,
  productCustomInput: true,
  productNameLabelKey: "eventDetailProductName",
  noteLabelKey: "eventDetailNote",
  clinicName: false,
  clinicAddress: false,
  cost: false,
  quantityOffered: false,
  quantity: false,
  showUnitInput: false,
  multiProduct: false,
  rememberLastProduct: false,
  fecalScale: false,
  scale3: false,
  note: true,
  quantityLabelKey: "eventDetailQuantity",
  quantityOfferedLabelKey: "eventDetailQuantityOffered",
  defaultUnit: null,
};

const SCALE3_TYPES = new Set(["URINE_AMOUNT_3", "ENERGY_3", "APPETITE_3"]);

export function isScale3Type(scaleType: string | null | undefined): boolean {
  return scaleType != null && SCALE3_TYPES.has(scaleType);
}

export function scale3FieldLabelKey(scaleType: string | null | undefined): TranslationKey {
  if (scaleType === "URINE_AMOUNT_3") return "eventDetailUrineAmountLabel";
  if (scaleType === "ENERGY_3") return "eventDetailEnergyLabel";
  if (scaleType === "APPETITE_3") return "eventDetailAppetiteLabel";
  return "eventDetailScaleLabel";
}

type Scale3Value = 1 | 2 | 3;
export type Scale3ValueLabelKey =
  | `eventDetailUrineAmount.${Scale3Value}`
  | `eventDetailEnergy.${Scale3Value}`
  | `eventDetailAppetite.${Scale3Value}`
  | `eventDetailScale.${Scale3Value}`;

export function scale3ValueLabelKey(
  scaleType: string | null | undefined,
  value: number,
): Scale3ValueLabelKey | null {
  if (value !== 1 && value !== 2 && value !== 3) return null;
  if (scaleType === "URINE_AMOUNT_3") return `eventDetailUrineAmount.${value}`;
  if (scaleType === "ENERGY_3") return `eventDetailEnergy.${value}`;
  if (scaleType === "APPETITE_3") return `eventDetailAppetite.${value}`;
  return `eventDetailScale.${value}`;
}

export function eventDetailFields(
  eventTypeKey: string | null | undefined,
  scaleType: string | null | undefined,
): EventDetailFieldFlags {
  const key = eventTypeKey ?? "";

  if (key === "observation" || key === "energy") {
    return {
      ...NOTE_ONLY,
      scale3: scaleType === "ENERGY_3",
      productName: true,
      detailTags: true,
      productCustomInput: false,
      productNameLabelKey: productNameFieldLabelKey(key),
      noteLabelKey: "eventDetailNote",
    };
  }

  // 관리(양치·눈 닦기·귀 청소·발톱·목욕·빗질·만져주기) — "했다"를 태그로만 받는다
  if (key === "care") {
    return {
      ...NOTE_ONLY,
      productName: true,
      detailTags: true,
      productCustomInput: false,
      productNameLabelKey: productNameFieldLabelKey(key),
    };
  }

  if (scaleType === "FECAL_7") {
    return { ...NOTE_ONLY, fecalScale: true };
  }

  if (isScale3Type(scaleType)) {
    return { ...NOTE_ONLY, scale3: true };
  }

  if (key === "meal" || key === "treat" || key === "supplement" || key === "remedy") {
    return {
      productName: true,
      detailTags: false,
      productCustomInput: true,
      productNameLabelKey: productNameFieldLabelKey(key),
      noteLabelKey: "eventDetailNote",
      clinicName: false,
      clinicAddress: false,
      cost: false,
      quantityOffered: key === "meal",
      quantity: true,
      showUnitInput: true,
      multiProduct: key !== "remedy",
      rememberLastProduct: true,
      fecalScale: false,
      scale3: false,
      note: true,
      quantityLabelKey: "eventDetailQuantityConsumed",
      quantityOfferedLabelKey: "eventDetailQuantityOffered",
      defaultUnit: key === "remedy" ? null : "g",
    };
  }

  if (key === "vomit") {
    return {
      ...NOTE_ONLY,
      productName: true,
      detailTags: true,
      productCustomInput: true,
      productNameLabelKey: productNameFieldLabelKey(key),
    };
  }

  if (key === "water") {
    return {
      productName: false,
      detailTags: false,
      productCustomInput: true,
      productNameLabelKey: "eventDetailProductName",
      noteLabelKey: "eventDetailNote",
      clinicName: false,
      clinicAddress: false,
      cost: false,
      quantityOffered: false,
      quantity: true,
      showUnitInput: false,
      multiProduct: false,
      rememberLastProduct: false,
      fecalScale: false,
      scale3: false,
      note: true,
      quantityLabelKey: "eventDetailVolume",
      quantityOfferedLabelKey: "eventDetailQuantityOffered",
      defaultUnit: "ml",
    };
  }

  if (key === "weight") {
    return {
      productName: false,
      detailTags: false,
      productCustomInput: true,
      productNameLabelKey: "eventDetailProductName",
      noteLabelKey: "eventDetailNote",
      clinicName: false,
      clinicAddress: false,
      cost: false,
      quantityOffered: false,
      quantity: true,
      showUnitInput: false,
      multiProduct: false,
      rememberLastProduct: false,
      fecalScale: false,
      scale3: false,
      note: true,
      quantityLabelKey: "eventDetailWeight",
      quantityOfferedLabelKey: "eventDetailQuantityOffered",
      defaultUnit: "kg",
    };
  }

  // 체온 — 체중과 같은 측정값. 값 한 칸, 단위는 °C 고정. 측정 방법은 태그(하나), 체온계는
  // 등록 기기(DEVICE)를 productId로 — 관리가 위생용품을 다는 것과 같은 구조 (§7.23)
  if (key === "temperature") {
    return {
      productName: true,
      detailTags: true,
      productCustomInput: false,
      productNameLabelKey: productNameFieldLabelKey(key),
      noteLabelKey: "eventDetailNote",
      clinicName: false,
      clinicAddress: false,
      cost: false,
      quantityOffered: false,
      quantity: true,
      showUnitInput: false,
      multiProduct: false,
      rememberLastProduct: true,
      fecalScale: false,
      scale3: false,
      note: true,
      quantityLabelKey: "eventDetailTemperature",
      quantityOfferedLabelKey: "eventDetailQuantityOffered",
      defaultUnit: "°C",
    };
  }

  if (key === "walk" || key === "play") {
    return {
      productName: false,
      detailTags: false,
      productCustomInput: true,
      productNameLabelKey: "eventDetailProductName",
      noteLabelKey: "eventDetailNote",
      clinicName: false,
      clinicAddress: false,
      cost: false,
      quantityOffered: false,
      quantity: true,
      showUnitInput: false,
      multiProduct: false,
      rememberLastProduct: false,
      fecalScale: false,
      scale3: false,
      note: true,
      quantityLabelKey: "eventDetailDuration",
      quantityOfferedLabelKey: "eventDetailQuantityOffered",
      defaultUnit: "min",
    };
  }

  if (key === "vet_visit") {
    return {
      ...NOTE_ONLY,
      clinicName: true,
      clinicAddress: true,
      cost: true,
      note: true,
    };
  }

  if (key === "medication") {
    return NOTE_ONLY;
  }

  return NOTE_ONLY;
}

export function resolveEventUnit(
  fields: EventDetailFieldFlags,
  unitInput: string,
): string | null {
  if (!fields.quantity && !fields.quantityOffered) return null;
  if (fields.showUnitInput) {
    const trimmed = unitInput.trim();
    return trimmed || fields.defaultUnit;
  }
  return fields.defaultUnit;
}

export function quantityPlaceholder(
  eventTypeKey: string | null | undefined,
  hasOffered: boolean,
): string {
  const key = eventTypeKey ?? "";
  if (key === "weight") return "4.2";
  if (key === "temperature") return "38.5";
  if (key === "water") return "100";
  if (key === "walk" || key === "play") return "30";
  if (hasOffered) return "30";
  return "100";
}

export function formatScaleValuePart(
  scaleType: string | null | undefined,
  scaleValue: number | null,
  t: (key: TranslationKey) => string,
): string | null {
  if (scaleValue == null) return null;
  if (scaleType === "FECAL_7") return `${scaleValue}/7`;
  if (isScale3Type(scaleType)) {
    const key = scale3ValueLabelKey(scaleType, scaleValue);
    return key ? t(key) : null;
  }
  return null;
}

/** 목록 요약(제품·수량·척도). 메모는 넣지 않는다 — 행을 눌러 상세에서 본다. */
/**
 * 제품 자리에 보일 문자열. 이름 타입은 등록 제품 이름이 스냅샷(`productName`)을 대신하고,
 * 태그 타입(관리)은 태그 라벨 뒤에 제품 이름을 **붙인다** — 모래 갈이 · 벤토나이트 (§7.20)
 */
export function productValueDisplay(
  detailTags: boolean,
  productNameDisplay: string | null,
  linkedProductName: string | null,
): string | null {
  const linked = linkedProductName?.trim() || null;
  if (!detailTags) return linked ?? productNameDisplay;
  const parts = [productNameDisplay, linked].filter((p): p is string => !!p);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function formatEventDetailLine(
  event: {
    productName?: string | null;
    /** 연결된 등록 제품 이름 (`event.product.name`) */
    linkedProductName?: string | null;
    clinicName?: string | null;
    clinicAddress?: string | null;
    costKrw?: number | null;
    medicationCourseName?: string | null;
    doseAmount?: string | null;
    doseOrdinal?: number | null;
    doseTotal?: number | null;
    quantity: number | null;
    quantityOffered: number | null;
    unit: string | null;
    scaleValue: number | null;
    eventType: { key: string; scaleType?: string | null };
  },
  t?: (key: TranslationKey, params?: Record<string, string | number>) => string,
): string | null {
  const flags = eventDetailFields(event.eventType.key, event.eventType.scaleType);
  const unit = event.unit ?? flags.defaultUnit ?? "";
  const parts: string[] = [];

  if (flags.productName) {
    const stored = event.productName?.trim() || null;
    const storedDisplay =
      stored && t
        ? (formatProductNameDisplay(event.eventType.key, stored, t) ?? stored)
        : stored;
    const shown = productValueDisplay(
      flags.detailTags,
      storedDisplay,
      event.linkedProductName ?? null,
    );
    if (shown) parts.push(shown);
  }

  if (flags.clinicName && event.clinicName?.trim()) {
    parts.push(event.clinicName.trim());
  }

  if (flags.cost && event.costKrw != null) {
    parts.push(
      t
        ? `${event.costKrw.toLocaleString()}${t("eventDetailCostUnit")}`
        : `${event.costKrw.toLocaleString()}원`,
    );
  }

  if (event.eventType.key === "medication" && event.medicationCourseName?.trim()) {
    parts.push(event.medicationCourseName.trim());
  }

  if (event.eventType.key === "medication" && event.doseAmount?.trim()) {
    parts.push(event.doseAmount.trim());
  }

  // 회차와 남은 횟수. 총 횟수를 안 넣은 처방이면 회차만 나온다 — 없는 값을 추정하지 않는다.
  if (event.eventType.key === "medication" && event.doseOrdinal != null) {
    const total = event.doseTotal ?? null;
    if (total != null) {
      parts.push(
        t
          ? t("eventDetailDoseOrdinalOfTotal", { n: event.doseOrdinal, total })
          : `${event.doseOrdinal}/${total}`,
      );
      const left = Math.max(0, total - event.doseOrdinal);
      parts.push(t ? t("careDosesRemaining", { count: left }) : `${left}`);
    } else {
      parts.push(t ? t("eventDetailDoseOrdinal", { n: event.doseOrdinal }) : `${event.doseOrdinal}`);
    }
  }

  if (flags.quantityOffered && flags.quantity) {
    if (event.quantityOffered != null && event.quantity != null) {
      parts.push(`${event.quantityOffered}${unit} / ${event.quantity}${unit}`);
    } else if (event.quantityOffered != null) {
      parts.push(event.unit ? `${event.quantityOffered}${unit}` : String(event.quantityOffered));
    } else if (event.quantity != null) {
      parts.push(event.unit ? `${event.quantity}${unit}` : String(event.quantity));
    }
  } else if (flags.quantity && event.quantity != null) {
    parts.push(event.unit || flags.defaultUnit ? `${event.quantity}${unit}` : String(event.quantity));
  }

  if (flags.fecalScale && event.scaleValue != null) {
    const part = t ? formatScaleValuePart(event.eventType.scaleType, event.scaleValue, t) : `${event.scaleValue}/7`;
    if (part) parts.push(part);
  }

  if (flags.scale3 && event.scaleValue != null) {
    const part = t ? formatScaleValuePart(event.eventType.scaleType, event.scaleValue, t) : String(event.scaleValue);
    if (part) parts.push(part);
  }

  // 메모는 목록 요약에 넣지 않는다. 한 줄로 이어 붙이면 수량·척도가 밀리고,
  // 긴 메모는 행을 눌러 상세에서 본다.
  return parts.length > 0 ? parts.join(" · ") : null;
}
