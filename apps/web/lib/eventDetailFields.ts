/** 이벤트 유형별 상세 시트·타임라인에 노출할 필드 (통합 폼 금지). */
export type EventDetailFieldFlags = {
  productName: boolean;
  clinicName: boolean;
  clinicAddress: boolean;
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
  clinicName: false,
  clinicAddress: false,
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
  if (scaleType === "FECAL_7") {
    return { ...NOTE_ONLY, fecalScale: true };
  }

  if (isScale3Type(scaleType)) {
    return { ...NOTE_ONLY, scale3: true };
  }

  const key = eventTypeKey ?? "";

  if (key === "meal" || key === "treat") {
    return {
      productName: true,
      clinicName: false,
      clinicAddress: false,
      quantityOffered: key === "meal",
      quantity: true,
      showUnitInput: true,
      fecalScale: false,
      note: true,
      quantityLabelKey: "eventDetailQuantityConsumed",
      quantityOfferedLabelKey: "eventDetailQuantityOffered",
      defaultUnit: "g",
    };
  }

  if (key === "water") {
    return {
      productName: false,
      clinicName: false,
      clinicAddress: false,
      quantityOffered: false,
      quantity: true,
      showUnitInput: false,
      fecalScale: false,
      note: true,
      quantityLabelKey: "eventDetailVolume",
      quantityOfferedLabelKey: "eventDetailQuantityOffered",
      defaultUnit: "ml",
    };
  }

  if (key === "weight") {
    return {
      productName: false,
      clinicName: false,
      clinicAddress: false,
      quantityOffered: false,
      quantity: true,
      showUnitInput: false,
      fecalScale: false,
      note: true,
      quantityLabelKey: "eventDetailWeight",
      quantityOfferedLabelKey: "eventDetailQuantityOffered",
      defaultUnit: "kg",
    };
  }

  if (key === "walk" || key === "play") {
    return {
      productName: false,
      clinicName: false,
      clinicAddress: false,
      quantityOffered: false,
      quantity: true,
      showUnitInput: false,
      fecalScale: false,
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
      note: true,
    };
  }

  if (key === "medication") {
    return NOTE_ONLY;
  }

  if (key === "supplement") {
    return {
      ...NOTE_ONLY,
      productName: true,
    };
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

export function formatEventDetailLine(
  event: {
    productName?: string | null;
    clinicName?: string | null;
    clinicAddress?: string | null;
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
    parts.push(event.productName.trim());
  }

  if (flags.clinicName && event.clinicName?.trim()) {
    parts.push(event.clinicName.trim());
  }

  if (flags.clinicAddress && event.clinicAddress?.trim()) {
    parts.push(event.clinicAddress.trim());
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

  if (flags.note && event.note?.trim()) parts.push(event.note.trim());
  return parts.length > 0 ? parts.join(" · ") : null;
}
