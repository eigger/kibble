import { PRODUCT_LINK_ONLY_EVENT_KEYS } from "@kibble/shared";
import { eventDetailFields } from "./eventDetailFields";
import {
  encodeProductNameValue,
  eventDetailTagGroupsFor,
  eventDetailTagsFor,
  parseProductNameValue,
} from "./eventDetailTags";
import type { PresetDetail, RoutineItem, Species } from "./types";

/** 루틴 시트의 항목 한 줄 (편집 중 값 — 전부 문자열/원시값) */
export interface ItemDraft {
  key: string;
  presetId: string;
  quantity: string;
  /** 사료만 — 제공량. `quantity`는 섭취량이다 */
  quantityOffered: string;
  unit: string;
  productId: string;
  /** 투약 칩일 때만 — 슬롯은 실행 때 서버가 고른다 */
  courseId: string;
  /** 태그 타입일 때 고른 태그 — `productName`에 slug CSV로 저장한다 */
  tagIds: string[];
  /** 태그 목록에 없는 옛 값 — 보이지 않아도 저장 때 그대로 돌려보낸다 (K-13) */
  tagCustom: string;
}

/**
 * 루틴에서 태그를 고르는 타입 — 관리·관찰·구토. 체온은 뺀다: 체온은 측정값이라 루틴에 미리 정한
 * 숫자를 넣으면 측정 없이 기록이 생겨 그래프를 오염시킨다 (§7.24).
 */
const ROUTINE_TAG_EVENT_KEYS: ReadonlySet<string> = new Set(["care", "observation", "vomit"]);

export function isRoutineTagType(eventTypeKey: string | null | undefined): boolean {
  return (
    !!eventTypeKey &&
    ROUTINE_TAG_EVENT_KEYS.has(eventTypeKey) &&
    eventDetailTagsFor(eventTypeKey).length > 0
  );
}

/** 태그만으로 말이 되는 타입 — 제품을 잇는 건 위생용품을 다는 관리뿐이다 */
export function isTagOnlyType(eventTypeKey: string | null | undefined): boolean {
  return isRoutineTagType(eventTypeKey) && !PRODUCT_LINK_ONLY_EVENT_KEYS.has(eventTypeKey!);
}

/** 이 타입의 항목이 양·단위를 갖는가 — 태그 타입(관리·관찰·구토)은 양이 없다 */
export function itemHasAmount(eventTypeKey: string | null | undefined): boolean {
  return !isRoutineTagType(eventTypeKey) || eventDetailFields(eventTypeKey, null).quantity;
}

export function draftFromItem(item: RoutineItem, key: string, validPresetId: string): ItemDraft {
  const tagged = isRoutineTagType(item.eventType.key);
  const parsed = tagged
    ? parseProductNameValue(item.eventType.key, item.productName)
    : { tagIds: [], custom: "" };
  return {
    key,
    presetId: validPresetId,
    quantity: item.quantity != null ? String(item.quantity) : "",
    quantityOffered: item.quantityOffered != null ? String(item.quantityOffered) : "",
    unit: item.unit ?? "",
    productId: item.productId ?? "",
    courseId: item.medicationCourseId ?? "",
    tagIds: parsed.tagIds,
    tagCustom: parsed.custom,
  };
}

/** 종류를 바꾸면 이전 종류의 값(태그·제품·양)이 남지 않게 비운다. 같은 타입의 다른 칩이면 그대로 둔다 */
export function resetOnTypeChange(
  prev: PresetDetail | undefined,
  next: PresetDetail | undefined,
): Partial<ItemDraft> {
  if (prev && next && prev.eventTypeId === next.eventTypeId) return {};
  return { tagIds: [], tagCustom: "", productId: "", quantity: "", quantityOffered: "" };
}

export interface RoutineItemPayload {
  eventTypeId: string;
  presetId: string;
  productId?: string | null;
  productName?: string | null;
  quantity?: number | null;
  quantityOffered?: number | null;
  unit?: string | null;
  medicationCourseId?: string;
}

function numberOrNull(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** 편집 중 항목 → 저장 본문. 입력란이 숨겨진 값(양·단위·화면에 없는 태그)은 보내지 않는다 */
export function buildItemPayload(
  draft: ItemDraft,
  preset: PresetDetail,
  species?: Species | null,
): RoutineItemPayload {
  const key = preset.eventType.key;
  if (key === "medication") {
    // 투약은 처방만 — 용량은 처방에 적혀 있고 슬롯은 실행 때 정해진다
    return { eventTypeId: preset.eventTypeId, presetId: preset.id, medicationCourseId: draft.courseId };
  }
  const hasAmount = itemHasAmount(key);
  const tagged = isRoutineTagType(key);
  // 피커가 종에 맞게 거른 태그만 남긴다 — 화면에 없는 태그는 사용자가 지울 수 없다
  const visible = new Set(
    eventDetailTagGroupsFor(key, species).flatMap((group) => group.tags.map((tag) => tag.id)),
  );
  const tagIds = draft.tagIds.filter((id) => visible.has(id));
  return {
    eventTypeId: preset.eventTypeId,
    presetId: preset.id,
    productId: draft.productId || null,
    // 태그 타입의 productName은 이름이 아니라 slug 목록이다 (§7.20) — 비우면 null
    productName: tagged ? encodeProductNameValue(key, tagIds, draft.tagCustom) || null : null,
    quantity: hasAmount ? numberOrNull(draft.quantity) : null,
    quantityOffered: hasAmount && key === "meal" ? numberOrNull(draft.quantityOffered) : null,
    unit: hasAmount ? draft.unit.trim() || null : null,
  };
}
