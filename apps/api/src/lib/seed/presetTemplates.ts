import type { Species } from "@prisma/client";

export type PresetTemplateRow = {
  eventTypeKey: string;
  label: string;
  sortOrder: number;
  isStarter: boolean;
};

/** docs/seed-event-types.md §4.2 */
const CAT_TEMPLATES: PresetTemplateRow[] = [
  { eventTypeKey: "meal", label: "eventType.meal", sortOrder: 0, isStarter: true },
  { eventTypeKey: "water", label: "eventType.water", sortOrder: 1, isStarter: true },
  { eventTypeKey: "poop", label: "eventType.poop", sortOrder: 2, isStarter: true },
  { eventTypeKey: "pee", label: "eventType.pee", sortOrder: 3, isStarter: false },
  { eventTypeKey: "treat", label: "eventType.treat", sortOrder: 4, isStarter: false },
  { eventTypeKey: "medication", label: "eventType.medication", sortOrder: 5, isStarter: false },
  { eventTypeKey: "vomit", label: "eventType.vomit", sortOrder: 6, isStarter: false },
  { eventTypeKey: "supplement", label: "eventType.supplement", sortOrder: 7, isStarter: false },
  { eventTypeKey: "energy", label: "eventType.energy", sortOrder: 8, isStarter: false },
  { eventTypeKey: "weight", label: "eventType.weight", sortOrder: 9, isStarter: false },
  { eventTypeKey: "vet_visit", label: "eventType.vet_visit", sortOrder: 10, isStarter: false },
];

/** docs/seed-event-types.md §4.3 */
const DOG_TEMPLATES: PresetTemplateRow[] = [
  { eventTypeKey: "meal", label: "eventType.meal", sortOrder: 0, isStarter: true },
  { eventTypeKey: "water", label: "eventType.water", sortOrder: 1, isStarter: true },
  { eventTypeKey: "poop", label: "eventType.poop", sortOrder: 2, isStarter: true },
  { eventTypeKey: "pee", label: "eventType.pee", sortOrder: 3, isStarter: false },
  { eventTypeKey: "treat", label: "eventType.treat", sortOrder: 4, isStarter: false },
  { eventTypeKey: "medication", label: "eventType.medication", sortOrder: 5, isStarter: false },
  { eventTypeKey: "walk", label: "eventType.walk", sortOrder: 6, isStarter: false },
  { eventTypeKey: "supplement", label: "eventType.supplement", sortOrder: 7, isStarter: false },
  { eventTypeKey: "energy", label: "eventType.energy", sortOrder: 8, isStarter: false },
  { eventTypeKey: "weight", label: "eventType.weight", sortOrder: 9, isStarter: false },
  { eventTypeKey: "vet_visit", label: "eventType.vet_visit", sortOrder: 10, isStarter: false },
];

/** docs/seed-event-types.md §4.4 */
const OTHER_TEMPLATES: PresetTemplateRow[] = [
  { eventTypeKey: "meal", label: "eventType.meal", sortOrder: 0, isStarter: true },
  { eventTypeKey: "water", label: "eventType.water", sortOrder: 1, isStarter: true },
  { eventTypeKey: "poop", label: "eventType.poop", sortOrder: 2, isStarter: true },
  { eventTypeKey: "pee", label: "eventType.pee", sortOrder: 3, isStarter: false },
  { eventTypeKey: "treat", label: "eventType.treat", sortOrder: 4, isStarter: false },
  { eventTypeKey: "medication", label: "eventType.medication", sortOrder: 5, isStarter: false },
  { eventTypeKey: "supplement", label: "eventType.supplement", sortOrder: 6, isStarter: false },
  { eventTypeKey: "energy", label: "eventType.energy", sortOrder: 7, isStarter: false },
  { eventTypeKey: "weight", label: "eventType.weight", sortOrder: 8, isStarter: false },
  { eventTypeKey: "vet_visit", label: "eventType.vet_visit", sortOrder: 9, isStarter: false },
];

export function presetTemplatesForSpecies(species: Species): PresetTemplateRow[] {
  switch (species) {
    case "CAT":
      return CAT_TEMPLATES;
    case "DOG":
      return DOG_TEMPLATES;
    default:
      return OTHER_TEMPLATES;
  }
}

/** §4.0 삽입 규칙 — DB 없이 테스트 가능한 순수 함수 */
export function selectPresetsToInsert(
  templates: PresetTemplateRow[],
  eventTypeIdByKey: Map<string, string>,
  existingEventTypeIds: Set<string>,
  isFirstHouseholdPet: boolean,
): Array<PresetTemplateRow & { eventTypeId: string; applyStarter: boolean }> {
  const rows: Array<PresetTemplateRow & { eventTypeId: string; applyStarter: boolean }> = [];

  for (const template of templates) {
    const eventTypeId = eventTypeIdByKey.get(template.eventTypeKey);
    if (!eventTypeId || existingEventTypeIds.has(eventTypeId)) continue;

    rows.push({
      ...template,
      eventTypeId,
      applyStarter: template.isStarter && isFirstHouseholdPet,
    });
  }

  return rows;
}
