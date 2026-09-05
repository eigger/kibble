import type { TranslationKey } from "./i18n/translations";
import type { PresetCategory } from "./presetGroups";
import { PRESET_CATEGORY_ORDER, presetCategoryShortKey } from "./presetGroups";
import { formatEventDetailLine } from "./eventDetailFields";
import type { TimelineEvent } from "./types";

export function eventCategory(event: {
  eventType: { key: string; category?: string | null };
}): PresetCategory {
  const raw = event.eventType.category;
  if (raw && (PRESET_CATEGORY_ORDER as readonly string[]).includes(raw)) {
    return raw as PresetCategory;
  }
  return "NOTE";
}

export function eventCategoryLabel(
  event: { eventType: { key: string; category?: string | null } },
  t: (key: TranslationKey) => string,
): string {
  return t(presetCategoryShortKey(eventCategory(event)));
}

export function clinicFieldsFromContact(event: {
  contact?: {
    name: string;
    address: string | null;
    latitude?: number | null;
    longitude?: number | null;
    placeUrl?: string | null;
  } | null;
}): {
  clinicName: string | null;
  clinicAddress: string | null;
  clinicLatitude: number | null;
  clinicLongitude: number | null;
  clinicPlaceUrl: string | null;
} {
  return {
    clinicName: event.contact?.name ?? null,
    clinicAddress: event.contact?.address ?? null,
    clinicLatitude: event.contact?.latitude ?? null,
    clinicLongitude: event.contact?.longitude ?? null,
    clinicPlaceUrl: event.contact?.placeUrl ?? null,
  };
}

export function formatEventTime(iso: string, locale: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(locale === "ko" ? "ko-KR" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  });
}

export function formatEventDate(iso: string, locale: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(locale === "ko" ? "ko-KR" : "en-US", {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Seoul",
  });
}

/**
 * Prisma는 생성 시 createdAt·updatedAt을 같은 순간에 찍는다 — 그런데도 미세하게
 * 어긋날 수 있어(같은 트랜잭션 안 서로 다른 now() 호출) 여유를 둔다. 이 문턱을
 * 넘어야 "나중에 실제로 고쳤다"로 본다.
 */
const EDITED_THRESHOLD_MS = 2000;

/**
 * 상세 시트 하단에 붙는 "작성자 · 최종 수정" 메타 줄. 작성자를 모르면(API 토큰으로
 * 생성된 기록, 혹은 계정이 삭제된 경우) 그 줄을 건너뛰고, 생성 이후 실제로 고친 적이
 * 없으면 수정 시각도 건너뛴다 — 모든 기록에 "방금 수정됨"이 붙는 소음을 피한다.
 * 수정한 사람이 작성자와 같으면 이름을 반복하지 않는다.
 */
export function eventAuditParts(
  event: {
    createdByName?: string | null;
    updatedByName?: string | null;
    createdAt?: string;
    updatedAt?: string;
  },
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
  locale: string,
): string[] {
  const parts: string[] = [];
  const creatorName = event.createdByName ?? null;
  if (creatorName) {
    parts.push(t("eventDetailCreatedBy", { name: creatorName }));
  }

  if (event.createdAt && event.updatedAt) {
    const createdMs = new Date(event.createdAt).getTime();
    const updatedMs = new Date(event.updatedAt).getTime();
    if (Number.isFinite(createdMs) && Number.isFinite(updatedMs) && updatedMs - createdMs > EDITED_THRESHOLD_MS) {
      const when = `${formatEventDate(event.updatedAt, locale)} ${formatEventTime(event.updatedAt, locale)}`;
      const editorName = event.updatedByName ?? null;
      if (editorName && editorName !== creatorName) {
        parts.push(t("eventDetailLastModifiedBy", { name: editorName, datetime: when }));
      } else {
        parts.push(t("eventDetailLastModified", { datetime: when }));
      }
    }
  }
  return parts;
}

export function eventDisplayLabel(
  event: TimelineEvent,
  translateLabel: (labelOrKey: string) => string,
): string {
  if (event.eventType.key === "medication" && event.course?.name) {
    return event.course.name;
  }
  if (event.preset?.label) return translateLabel(event.preset.label);
  return translateLabel(event.eventType.label);
}

export function eventDetailLine(
  event: TimelineEvent,
  t: (key: TranslationKey) => string,
): string | null {
  const clinic = clinicFieldsFromContact(event);
  const showCourseInDetail =
    event.eventType.key === "medication" && event.course?.name ? false : true;
  return formatEventDetailLine(
    {
      productName: event.product?.name ?? event.productName,
      clinicName: clinic.clinicName,
      clinicAddress: clinic.clinicAddress,
      costKrw: event.costKrw,
      medicationCourseName:
        showCourseInDetail && event.course?.name ? event.course.name : null,
      quantity: event.quantity,
      quantityOffered: event.quantityOffered,
      unit: event.unit,
      scaleValue: event.scaleValue,
      eventType: { key: event.eventType.key, scaleType: event.eventType.scaleType },
    },
    t,
  );
}
