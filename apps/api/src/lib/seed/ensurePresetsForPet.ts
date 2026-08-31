import type { Prisma, PrismaClient, Species } from "@prisma/client";
import { presetTemplatesForSpecies, selectPresetsToInsert } from "./presetTemplates.js";

export class SystemEventTypesNotSeededError extends Error {
  constructor() {
    super("SYSTEM_EVENT_TYPES_NOT_SEEDED");
    this.name = "SystemEventTypesNotSeededError";
  }
}

/**
 * 반려동물 등록 직후 종별 프리셋을 해당 petId에 묶어 생성한다.
 * petId=null(가구 공유)이면 다종 가구에서 종 특화 칩이 섞인다 — docs/seed-event-types.md §4.0.
 */
export async function ensurePresetsForPetInTx(
  tx: Prisma.TransactionClient,
  householdId: string,
  petId: string,
  species: Species,
): Promise<number> {
  const petCount = await tx.pet.count({ where: { householdId, archivedAt: null } });
  const isFirstHouseholdPet = petCount === 1;

  const templates = presetTemplatesForSpecies(species);
  const systemTypes = await tx.eventType.findMany({
    where: { householdId: null, key: { in: templates.map((t) => t.eventTypeKey) } },
    select: { id: true, key: true },
  });
  const eventTypeIdByKey = new Map(systemTypes.map((t) => [t.key, t.id]));

  const missingKeys = templates
    .map((t) => t.eventTypeKey)
    .filter((key) => !eventTypeIdByKey.has(key));
  if (missingKeys.length > 0) {
    throw new SystemEventTypesNotSeededError();
  }

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
}

export async function ensurePresetsForPet(
  prisma: PrismaClient,
  householdId: string,
  petId: string,
  species: Species,
): Promise<number> {
  return prisma.$transaction((tx) =>
    ensurePresetsForPetInTx(tx, householdId, petId, species),
  );
}
