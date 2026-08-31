import type { PrismaClient, Species } from "@prisma/client";
import { presetTemplatesForSpecies, selectPresetsToInsert } from "./presetTemplates.js";

/**
 * 반려동물 등록 직후 종별 프리셋을 해당 petId에 묶어 생성한다.
 * petId=null(가구 공유)이면 다종 가구에서 종 특화 칩이 섞인다 — docs/seed-event-types.md §4.0.
 */
export async function ensurePresetsForPet(
  prisma: PrismaClient,
  householdId: string,
  petId: string,
  species: Species,
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const petCount = await tx.pet.count({ where: { householdId } });
    const isFirstHouseholdPet = petCount === 1;

    const templates = presetTemplatesForSpecies(species);
    const systemTypes = await tx.eventType.findMany({
      where: { householdId: null, key: { in: templates.map((t) => t.eventTypeKey) } },
      select: { id: true, key: true },
    });
    const eventTypeIdByKey = new Map(systemTypes.map((t) => [t.key, t.id]));

    const existingPresets = await tx.preset.findMany({
      where: { householdId, petId },
      select: { eventTypeId: true },
    });
    const existingEventTypeIds = new Set(existingPresets.map((p) => p.eventTypeId));

    const toInsert = selectPresetsToInsert(
      templates,
      eventTypeIdByKey,
      existingEventTypeIds,
      isFirstHouseholdPet,
    );
    if (toInsert.length === 0) return 0;

    const result = await tx.preset.createMany({
      data: toInsert.map((row) => ({
        householdId,
        petId,
        eventTypeId: row.eventTypeId,
        label: row.label,
        sortOrder: row.sortOrder,
        isStarter: row.applyStarter,
      })),
      skipDuplicates: true,
    });

    return result.count;
  });
}
