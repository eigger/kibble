import { formatProductNameDisplay, productNameFieldLabelKey } from "./eventDetailTags";
export type EventDetailFieldFlags = {
  productName: boolean;
  /** 사료 원재료·구토 종류·관찰 항목 등 태그 칩 */
  detailTags: boolean;
  /** 태그 외 직접 입력란 (관찰은 메모로 대체) */
  productCustomInput: boolean;
  productNameLabelKey: string;
  noteLabelKey: string;
  clinicName: boolean;
  clinicAddress: boolean;
  cost: boolean;
  quantityOffered: boolean;
  quantity: boolean;
  /** 단위 입력란 노출 (기본 단위만 쓰는 타입은 false) */
  showUnitInput: boolean;
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

export function scale3FieldLabelKey(scaleType: string | null | undefined): string {
  if (scaleType === "URINE_AMOUNT_3") return "eventDetailUrineAmountLabel";
  if (scaleType === "ENERGY_3") return "eventDetailEnergyLabel";
  if (scaleType === "APPETITE_3") return "eventDetailAppetiteLabel";
  return "eventDetailScaleLabel";
}

export function scale3ValueLabelKey(scaleType: string | null | undefined, value: number): string {
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

  if (scaleType === "FECAL_7") {
    return { ...NOTE_ONLY, fecalScale: true };
  }

  if (isScale3Type(scaleType)) {
    return { ...NOTE_ONLY, scale3: true };
  }

  if (key === "meal" || key === "treat" || key === "supplement") {
    return {
      productName: true,
      detailTags: true,
      productCustomInput: true,
      productNameLabelKey: productNameFieldLabelKey(key),
      noteLabelKey: "eventDetailNote",
      clinicName: false,
      clinicAddress: false,
      cost: false,
      quantityOffered: key === "meal",
      quantity: true,
      showUnitInput: true,
      fecalScale: false,
      scale3: false,
      note: true,
      quantityLabelKey: "eventDetailQuantityConsumed",
      quantityOfferedLabelKey: "eventDetailQuantityOffered",
      defaultUnit: "g",
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
      fecalScale: false,
      scale3: false,
      note: true,
      quantityLabelKey: "eventDetailWeight",
      quantityOfferedLabelKey: "eventDetailQuantityOffered",
      defaultUnit: "kg",
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
  if (key === "water") return "100";
  if (key === "walk" || key === "play") return "30";
  if (hasOffered) return "30";
  return "100";
}

export function formatScaleValuePart(
  scaleType: string | null | undefined,
  scaleValue: number | null,
  t: (key: string) => string,
): string | null {
  if (scaleValue == null) return null;
  if (scaleType === "FECAL_7") return `${scaleValue}/7`;
  if (isScale3Type(scaleType)) return t(scale3ValueLabelKey(scaleType, scaleValue));
  return null;
}

/** 목록 요약(제품·수량·척도). 메모는 넣지 않는다 — 행을 눌러 상세에서 본다. */
export function formatEventDetailLine(
  event: {
    productName?: string | null;
    clinicName?: string | null;
    clinicAddress?: string | null;
    costKrw?: number | null;
    medicationCourseName?: string | null;
    quantity: number | null;
    quantityOffered: number | null;
    unit: string | null;
    scaleValue: number | null;
    note: string | null;
    eventType: { key: string; scaleType?: string | null };
  },
  t?: (key: string) => string,
): string | null {
  const flags = eventDetailFields(event.eventType.key, event.eventType.scaleType);
  const unit = event.unit ?? flags.defaultUnit ?? "";
  const parts: string[] = [];

  if (flags.productName && event.productName?.trim()) {
    parts.push(
      t
        ? formatProductNameDisplay(event.eventType.key, event.productName.trim(), t) ??
          event.productName.trim()
        : event.productName.trim(),
    );
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
    parts.push(t ? formatScaleValuePart(event.eventType.scaleType, event.scaleValue, t)! : `${event.scaleValue}/7`);
  }

  if (flags.scale3 && event.scaleValue != null) {
    parts.push(
      t
        ? formatScaleValuePart(event.eventType.scaleType, event.scaleValue, t)!
        : String(event.scaleValue),
    );
  }

  // 메모는 목록 요약에 넣지 않는다. 한 줄로 이어 붙이면 수량·척도가 밀리고,
  // 긴 메모는 행을 눌러 상세에서 본다.
  return parts.length > 0 ? parts.join(" · ") : null;
}
