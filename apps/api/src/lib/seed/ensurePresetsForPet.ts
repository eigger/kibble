import type { PrismaClient, Species } from "@prisma/client";
import { presetTemplatesForSpecies, selectPresetsToInsert } from "./presetTemplates.js";

/**
 * 반려동물 등록 시 종별 프리셋을 생성한다 (docs/seed-event-types.md §4).
 * P1-11 pets 라우트에서 호출 예정.
 */
export async function ensurePresetsForPet(
  prisma: PrismaClient,
  householdId: string,
  species: Species,
): Promise<number> {
  const templates = presetTemplatesForSpecies(species);

  const existingPresets = await prisma.preset.findMany({
    where: { householdId, petId: null },
    select: { eventTypeId: true },
  });
  const existingEventTypeIds = new Set(existingPresets.map((p) => p.eventTypeId));
  const isFirstPet = existingEventTypeIds.size === 0;

  const systemTypes = await prisma.eventType.findMany({
    where: { householdId: null, key: { in: templates.map((t) => t.eventTypeKey) } },
    select: { id: true, key: true },
  });
  const eventTypeIdByKey = new Map(systemTypes.map((t) => [t.key, t.id]));

  const toInsert = selectPresetsToInsert(templates, eventTypeIdByKey, existingEventTypeIds, isFirstPet);

  if (toInsert.length === 0) return 0;

  await prisma.preset.createMany({
    data: toInsert.map((row) => ({
      householdId,
      petId: null,
      eventTypeId: row.eventTypeId,
      label: row.label,
      sortOrder: row.sortOrder,
      isStarter: row.applyStarter,
    })),
  });

  return toInsert.length;
}
