import type { TranslationKey } from "./i18n/translations";

/** 이벤트 상세 — 태그 칩으로 고르는 값. `productName`에 slug를 `,`로 이어 저장한다. */

export type EventDetailTag = {
  id: string;
  labelKey: TranslationKey;
};

export type ParsedProductName = {
  tagIds: string[];
  custom: string;
};

export const EVENT_DETAIL_TAGS: Partial<Record<string, EventDetailTag[]>> = {
  meal: [
    { id: "chicken", labelKey: "eventTag.meal.chicken" },
    { id: "beef", labelKey: "eventTag.meal.beef" },
    { id: "pork", labelKey: "eventTag.meal.pork" },
    { id: "duck", labelKey: "eventTag.meal.duck" },
    { id: "lamb", labelKey: "eventTag.meal.lamb" },
    { id: "turkey", labelKey: "eventTag.meal.turkey" },
    { id: "tuna", labelKey: "eventTag.meal.tuna" },
    { id: "salmon", labelKey: "eventTag.meal.salmon" },
    { id: "mixed", labelKey: "eventTag.meal.mixed" },
  ],
  treat: [
    { id: "stick", labelKey: "eventTag.treat.stick" },
    { id: "freeze_dried", labelKey: "eventTag.treat.freeze_dried" },
    { id: "jerky", labelKey: "eventTag.treat.jerky" },
    { id: "biscuit", labelKey: "eventTag.treat.biscuit" },
    { id: "cream", labelKey: "eventTag.treat.cream" },
    { id: "chew", labelKey: "eventTag.treat.chew" },
  ],
  supplement: [
    { id: "enzyme", labelKey: "eventTag.supplement.enzyme" },
    { id: "probiotic", labelKey: "eventTag.supplement.probiotic" },
    { id: "omega", labelKey: "eventTag.supplement.omega" },
    { id: "vitamin", labelKey: "eventTag.supplement.vitamin" },
    { id: "joint", labelKey: "eventTag.supplement.joint" },
    { id: "kidney", labelKey: "eventTag.supplement.kidney" },
  ],
  vomit: [
    { id: "hairball", labelKey: "eventTag.vomit.hairball" },
    { id: "blood", labelKey: "eventTag.vomit.blood" },
    { id: "food", labelKey: "eventTag.vomit.food" },
    { id: "bile", labelKey: "eventTag.vomit.bile" },
    { id: "foam", labelKey: "eventTag.vomit.foam" },
  ],
  observation: [
    { id: "eye_discharge", labelKey: "eventTag.observation.eye_discharge" },
    { id: "ear_wax", labelKey: "eventTag.observation.ear_wax" },
    { id: "ear_smell", labelKey: "eventTag.observation.ear_smell" },
    { id: "skin", labelKey: "eventTag.observation.skin" },
    { id: "scratching", labelKey: "eventTag.observation.scratching" },
    { id: "cough", labelKey: "eventTag.observation.cough" },
    { id: "sneezing", labelKey: "eventTag.observation.sneezing" },
    { id: "limping", labelKey: "eventTag.observation.limping" },
    { id: "breathing", labelKey: "eventTag.observation.breathing" },
  ],
};

export function eventDetailTagsFor(eventTypeKey: string | null | undefined): EventDetailTag[] {
  if (!eventTypeKey) return [];
  return EVENT_DETAIL_TAGS[eventTypeKey] ?? [];
}

function knownTagIds(eventTypeKey: string | null | undefined): Set<string> {
  return new Set(eventDetailTagsFor(eventTypeKey).map((tag) => tag.id));
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

  for (const part of value.split(",").map((p) => p.trim()).filter(Boolean)) {
    if (known.has(part)) tagIds.push(part);
    else customParts.push(part);
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
    case "meal":
      return "eventDetailMealIngredient";
    case "treat":
      return "eventDetailTreatKind";
    case "supplement":
      return "eventDetailSupplementKind";
    case "vomit":
      return "eventDetailVomitKind";
    case "observation":
    case "energy":
      return "eventDetailObservationSigns";
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
