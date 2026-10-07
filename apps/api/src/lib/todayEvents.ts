import { resolveLabel, type ApiLocale } from "./i18n.js";
import { productNameIsTagList } from "./frequentProducts.js";

export type TodayEventRow = {
  id: string;
  occurredAt: Date;
  quantity: { toString(): string } | number | null;
  quantityOffered: { toString(): string } | number | null;
  unit: string | null;
  scaleValue: number | null;
  productName: string | null;
  note: string | null;
  doseSlotIndex: number | null;
  eventType: { key: string; label: string };
  preset: { label: string } | null;
  product: { name: string } | null;
  course: { name: string } | null;
};

/**
 * `GET /api/states`의 `todayEvents[]` 한 건.
 *
 * 원시 필드(`label`, `presetName`, `productName`)는 하위 호환을 위해 그대로 두고, 읽기 연동이
 * 바로 쓸 수 있는 해석된 필드를 더한다 — `eventTypeLabel`·`presetLabel`은 요청 언어(X-Locale)로
 * 푼 라벨, `productLabel`은 제품 이름(태그 타입은 null), `productTags`는 태그 타입의
 * `productName` CSV를 나눈 목록(slug 또는 사용자가 쓴 자유 문구)이다.
 */
export function serializeTodayEvent(event: TodayEventRow, locale: ApiLocale) {
  const tagType = productNameIsTagList(event.eventType.key);
  const productName = event.productName ?? event.product?.name ?? null;
  return {
    id: event.id,
    occurredAt: event.occurredAt.toISOString(),
    eventTypeKey: event.eventType.key,
    label: event.eventType.label,
    eventTypeLabel: resolveLabel(event.eventType.label, locale),
    quantity: event.quantity == null ? null : Number(event.quantity),
    quantityOffered: event.quantityOffered == null ? null : Number(event.quantityOffered),
    unit: event.unit,
    scaleValue: event.scaleValue,
    productName,
    productLabel: tagType ? (event.product?.name ?? null) : productName,
    productTags: tagType && event.productName
      ? event.productName
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean)
      : [],
    presetName: event.preset?.label ?? null,
    presetLabel: event.preset ? resolveLabel(event.preset.label, locale) : null,
    note: event.note,
    medicationCourseName: event.course?.name ?? null,
    doseSlotIndex: event.doseSlotIndex,
  };
}
