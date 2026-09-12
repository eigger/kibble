import type { TranslationKey } from "./i18n/translations";
import type { Species } from "./types";

/** 이벤트 상세 — 태그 칩으로 고르는 값. `productName`에 slug를 `,`로 이어 저장한다. */

export type EventDetailTagGroupKey = "body" | "behavior" | "toilet";

export type EventDetailTag = {
  id: string;
  labelKey: TranslationKey;
  /** 태그가 많은 타입은 묶음 소제목 아래 나눠 그린다 (관찰: 몸 / 증상·행동, 관리: 몸 / 화장실) */
  group?: EventDetailTagGroupKey;
  /**
   * 이 종에게만 보이는 태그. 없으면 전 종. 피커만 거른다 — 저장된 slug는 종과 무관하게
   * 읽는다 (K-13). `EventType.species`와 같은 결의 allowlist (§7.20)
   */
  species?: Species[];
};

export type EventDetailTagGroup = {
  group: EventDetailTagGroupKey | null;
  tags: EventDetailTag[];
};

export type ParsedProductName = {
  tagIds: string[];
  custom: string;
};

const OBSERVATION_BODY: EventDetailTag[] = [
  { id: "eye_discharge", labelKey: "eventTag.observation.eye_discharge", group: "body" },
  { id: "ear_wax", labelKey: "eventTag.observation.ear_wax", group: "body" },
  { id: "smell", labelKey: "eventTag.observation.smell", group: "body" },
  { id: "skin", labelKey: "eventTag.observation.skin", group: "body" },
  { id: "coat", labelKey: "eventTag.observation.coat", group: "body" },
  { id: "hair_loss", labelKey: "eventTag.observation.hair_loss", group: "body" },
  // 탈모와 별개다 — 원형 각질·딱지처럼 보호자가 "곰팡이"로 부르는 피부 소견. 진단은 수의사가 (K-16)
  { id: "fungus", labelKey: "eventTag.observation.fungus", group: "body" },
  { id: "teeth", labelKey: "eventTag.observation.teeth", group: "body" },
  { id: "gum_color", labelKey: "eventTag.observation.gum_color", group: "body" },
  // 잇몸 색과 별개다 — 귀 안쪽·코·피부 등 전반이 창백한지. 잇몸은 R139대로 따로 본다
  { id: "complexion", labelKey: "eventTag.observation.complexion", group: "body" },
  { id: "pupil", labelKey: "eventTag.observation.pupil", group: "body" },
  { id: "wound", labelKey: "eventTag.observation.wound", group: "body" },
];

const OBSERVATION_BEHAVIOR: EventDetailTag[] = [
  { id: "scratching", labelKey: "eventTag.observation.scratching", group: "behavior" },
  { id: "cough", labelKey: "eventTag.observation.cough", group: "behavior" },
  { id: "sneezing", labelKey: "eventTag.observation.sneezing", group: "behavior" },
  { id: "limping", labelKey: "eventTag.observation.limping", group: "behavior" },
  { id: "breathing", labelKey: "eventTag.observation.breathing", group: "behavior" },
  { id: "vocalizing", labelKey: "eventTag.observation.vocalizing", group: "behavior" },
  { id: "behavior", labelKey: "eventTag.observation.behavior", group: "behavior" },
  { id: "sleep_change", labelKey: "eventTag.observation.sleep_change", group: "behavior" },
];

// "봤다"(관찰)와 "했다"(관리)가 갈리도록 표현을 다르게 둔다 — 관찰은 눈꼽·귀지, 관리는 눈 닦기·귀 청소
const CARE_BODY: EventDetailTag[] = [
  { id: "dental", labelKey: "eventTag.care.dental", group: "body" },
  { id: "eye_clean", labelKey: "eventTag.care.eye_clean", group: "body" },
  { id: "ear_clean", labelKey: "eventTag.care.ear_clean", group: "body" },
  { id: "nail", labelKey: "eventTag.care.nail", group: "body" },
  { id: "bath", labelKey: "eventTag.care.bath", group: "body" },
  { id: "brush", labelKey: "eventTag.care.brush", group: "body" },
  { id: "petting", labelKey: "eventTag.care.petting", group: "body" },
];

// 화장실 — 어느 모래·패드를 썼는지는 등록 제품(HYGIENE)을 `productId`로 잇는다 (§7.20)
const CARE_TOILET: EventDetailTag[] = [
  { id: "toilet_clean", labelKey: "eventTag.care.toilet_clean", group: "toilet" },
  { id: "litter_topup", labelKey: "eventTag.care.litter_topup", group: "toilet", species: ["CAT", "OTHER"] },
  // 구 `litter_change` 시스템 타입의 기록이 시드 마이그레이션으로 이 slug를 단다
  { id: "litter_change", labelKey: "eventTag.care.litter_change", group: "toilet", species: ["CAT", "OTHER"] },
  { id: "pad_change", labelKey: "eventTag.care.pad_change", group: "toilet", species: ["DOG", "OTHER"] },
  { id: "toilet_wash", labelKey: "eventTag.care.toilet_wash", group: "toilet" },
];

export const EVENT_DETAIL_TAGS: Partial<Record<string, EventDetailTag[]>> = {
  vomit: [
    { id: "hairball", labelKey: "eventTag.vomit.hairball" },
    { id: "blood", labelKey: "eventTag.vomit.blood" },
    { id: "food", labelKey: "eventTag.vomit.food" },
    { id: "bile", labelKey: "eventTag.vomit.bile" },
    { id: "foam", labelKey: "eventTag.vomit.foam" },
  ],
  observation: [...OBSERVATION_BODY, ...OBSERVATION_BEHAVIOR],
  care: [...CARE_BODY, ...CARE_TOILET],
};

/** 이름을 바꾼 태그 — 저장된 옛 slug를 현재 id로 읽는다 (실기록 보존). */
const LEGACY_TAG_IDS: Partial<Record<string, Record<string, string>>> = {
  observation: { ear_smell: "smell" },
};

export const EVENT_DETAIL_TAG_GROUP_LABEL_KEYS: Record<EventDetailTagGroupKey, TranslationKey> = {
  body: "eventTagGroup.body",
  behavior: "eventTagGroup.behavior",
  toilet: "eventTagGroup.toilet",
};

export function eventDetailTagsFor(eventTypeKey: string | null | undefined): EventDetailTag[] {
  if (!eventTypeKey) return [];
  return EVENT_DETAIL_TAGS[eventTypeKey] ?? [];
}

function visibleForSpecies(tag: EventDetailTag, species: Species | null | undefined): boolean {
  if (!tag.species || !species) return true;
  return tag.species.includes(species);
}

/**
 * 피커에 그릴 묶음 — 순서대로. 묶음이 없는 타입은 `group: null` 하나로 돌아온다.
 * `species`를 주면 그 종에게 없는 태그(개에게 모래 갈이)를 뺀다. 모르면 전부 보인다.
 */
export function eventDetailTagGroupsFor(
  eventTypeKey: string | null | undefined,
  species?: Species | null,
): EventDetailTagGroup[] {
  const groups: EventDetailTagGroup[] = [];
  for (const tag of eventDetailTagsFor(eventTypeKey)) {
    if (!visibleForSpecies(tag, species)) continue;
    const key = tag.group ?? null;
    const last = groups[groups.length - 1];
    if (last && last.group === key) last.tags.push(tag);
    else groups.push({ group: key, tags: [tag] });
  }
  return groups;
}

function knownTagIds(eventTypeKey: string | null | undefined): Set<string> {
  return new Set(eventDetailTagsFor(eventTypeKey).map((tag) => tag.id));
}

function canonicalTagId(eventTypeKey: string | null | undefined, id: string): string {
  if (!eventTypeKey) return id;
  return LEGACY_TAG_IDS[eventTypeKey]?.[id] ?? id;
}

export function findEventDetailTag(
  eventTypeKey: string | null | undefined,
  value: string | null | undefined,
): EventDetailTag | undefined {
  if (!value?.trim()) return undefined;
  return eventDetailTagsFor(eventTypeKey).find((tag) => tag.id === value.trim());
}

export function parseProductNameValue(
  eventTypeKey: string | null | undefined,
  value: string | null | undefined,
): ParsedProductName {
  if (!value?.trim()) return { tagIds: [], custom: "" };

  const known = knownTagIds(eventTypeKey);
  const tagIds: string[] = [];
  const customParts: string[] = [];

  for (const raw of value.split(",").map((p) => p.trim()).filter(Boolean)) {
    const part = canonicalTagId(eventTypeKey, raw);
    if (known.has(part)) tagIds.push(part);
    else customParts.push(raw);
  }

  return { tagIds, custom: customParts.join(", ") };
}

export function encodeProductNameValue(
  eventTypeKey: string | null | undefined,
  tagIds: string[],
  custom: string,
): string {
  const known = knownTagIds(eventTypeKey);
  const parts = tagIds.filter((id) => known.has(id));
  const trimmedCustom = custom.trim();
  if (trimmedCustom) parts.push(trimmedCustom);
  return parts.join(",");
}

export function formatProductNameDisplay(
  eventTypeKey: string | null | undefined,
  value: string | null | undefined,
  t: (key: TranslationKey) => string,
): string | null {
  const { tagIds, custom } = parseProductNameValue(eventTypeKey, value);
  const labels = tagIds.map((id) => {
    const tag = findEventDetailTag(eventTypeKey, id);
    return tag ? t(tag.labelKey) : id;
  });
  if (custom) labels.push(custom);
  return labels.length > 0 ? labels.join(" · ") : null;
}

/** @deprecated formatProductNameDisplay 사용 */
export function resolveEventTagLabel(
  eventTypeKey: string | null | undefined,
  value: string | null | undefined,
  t: (key: TranslationKey) => string,
): string | null {
  return formatProductNameDisplay(eventTypeKey, value, t);
}

export function productNameFieldLabelKey(eventTypeKey: string | null | undefined): TranslationKey {
  switch (eventTypeKey) {
    case "vomit":
      return "eventDetailVomitKind";
    case "observation":
    case "energy":
      return "eventDetailObservationSigns";
    case "care":
      return "eventDetailCareItems";
    default:
      return "eventDetailProductName";
  }
}

export function toggleProductNameTag(
  eventTypeKey: string | null | undefined,
  currentTagIds: string[],
  tagId: string,
): string[] {
  if (!knownTagIds(eventTypeKey).has(tagId)) return currentTagIds;
  return currentTagIds.includes(tagId)
    ? currentTagIds.filter((id) => id !== tagId)
    : [...currentTagIds, tagId];
}
