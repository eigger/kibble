import type { TranslationKey } from "./i18n/translations";

/** 이벤트 상세 — 태그 칩으로 고르는 값. `productName`에 slug를 `,`로 이어 저장한다. */

export type EventDetailTagGroupKey = "body" | "behavior";

export type EventDetailTag = {
  id: string;
  labelKey: TranslationKey;
  /** 태그가 많은 타입은 묶음 소제목 아래 나눠 그린다 (관찰: 몸 / 증상·행동) */
  group?: EventDetailTagGroupKey;
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

export const EVENT_DETAIL_TAGS: Partial<Record<string, EventDetailTag[]>> = {
  vomit: [
    { id: "hairball", labelKey: "eventTag.vomit.hairball" },
    { id: "blood", labelKey: "eventTag.vomit.blood" },
    { id: "food", labelKey: "eventTag.vomit.food" },
    { id: "bile", labelKey: "eventTag.vomit.bile" },
    { id: "foam", labelKey: "eventTag.vomit.foam" },
  ],
  observation: [...OBSERVATION_BODY, ...OBSERVATION_BEHAVIOR],
  // "봤다"(관찰)와 "했다"(관리)가 갈리도록 표현을 다르게 둔다 — 관찰은 눈꼽·귀지, 관리는 눈 닦기·귀 청소
  care: [
    { id: "dental", labelKey: "eventTag.care.dental" },
    { id: "eye_clean", labelKey: "eventTag.care.eye_clean" },
    { id: "ear_clean", labelKey: "eventTag.care.ear_clean" },
    { id: "nail", labelKey: "eventTag.care.nail" },
    { id: "bath", labelKey: "eventTag.care.bath" },
    { id: "brush", labelKey: "eventTag.care.brush" },
    { id: "petting", labelKey: "eventTag.care.petting" },
  ],
};

/** 이름을 바꾼 태그 — 저장된 옛 slug를 현재 id로 읽는다 (실기록 보존). */
const LEGACY_TAG_IDS: Partial<Record<string, Record<string, string>>> = {
  observation: { ear_smell: "smell" },
};

export const EVENT_DETAIL_TAG_GROUP_LABEL_KEYS: Record<EventDetailTagGroupKey, TranslationKey> = {
  body: "eventTagGroup.body",
  behavior: "eventTagGroup.behavior",
};

export function eventDetailTagsFor(eventTypeKey: string | null | undefined): EventDetailTag[] {
  if (!eventTypeKey) return [];
  return EVENT_DETAIL_TAGS[eventTypeKey] ?? [];
}

/** 묶음 순서대로. 묶음이 없는 타입은 `group: null` 하나로 돌아온다. */
export function eventDetailTagGroupsFor(
  eventTypeKey: string | null | undefined,
): EventDetailTagGroup[] {
  const groups: EventDetailTagGroup[] = [];
  for (const tag of eventDetailTagsFor(eventTypeKey)) {
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
