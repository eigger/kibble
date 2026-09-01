import type { PresetCategory } from "./presetGroups";
import { PRESET_CATEGORY_ORDER } from "./presetGroups";
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
  t: (key: string) => string,
): string {
  return t(`presetCategoryShort.${eventCategory(event)}`);
}

export function clinicFieldsFromContact(event: {
  contact?: { name: string; address: string | null } | null;
}): { clinicName: string | null; clinicAddress: string | null } {
  return {
    clinicName: event.contact?.name ?? null,
    clinicAddress: event.contact?.address ?? null,
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

export function eventDisplayLabel(event: TimelineEvent, t: (key: string) => string): string {
  if (event.eventType.key === "medication" && event.course?.name) {
    return event.course.name;
  }
  if (event.preset?.label) return t(event.preset.label);
  return t(event.eventType.label);
}

export function eventDetailLine(
  event: TimelineEvent,
  t: (key: string) => string,
): string | null {
  const clinic = clinicFieldsFromContact(event);
  const showCourseInDetail =
    event.eventType.key === "medication" && event.course?.name ? false : true;
  return formatEventDetailLine(
    {
      productName: event.productName,
      clinicName: clinic.clinicName,
      clinicAddress: clinic.clinicAddress,
      medicationCourseName:
        showCourseInDetail && event.course?.name ? event.course.name : null,
      quantity: event.quantity,
      quantityOffered: event.quantityOffered,
      unit: event.unit,
      scaleValue: event.scaleValue,
      note: event.note,
      eventType: { key: event.eventType.key, scaleType: event.eventType.scaleType },
    },
    t,
  );
}
