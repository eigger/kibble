import type { PrismaClient } from "@prisma/client";

async function relabelEnergyPresets(prisma: PrismaClient): Promise<void> {
  await prisma.preset.updateMany({
    where: { label: "eventType.energy" },
    data: { label: "eventType.observation" },
  });
}

/** 시스템 `energy` 타입을 `observation`(관찰)으로 통합 — 기존 이벤트·프리셋 연결 유지 */
export async function migrateEnergyToObservation(prisma: PrismaClient): Promise<void> {
  const [energy, observation] = await Promise.all([
    prisma.eventType.findFirst({
      where: { householdId: null, key: "energy", archivedAt: null },
    }),
    prisma.eventType.findFirst({
      where: { householdId: null, key: "observation", archivedAt: null },
    }),
  ]);

  if (!energy) {
    await relabelEnergyPresets(prisma);
    return;
  }

  if (!observation) {
    await prisma.eventType.update({
      where: { id: energy.id },
      data: {
        key: "observation",
        label: "eventType.observation",
        icon: "eye",
        aliases: ["관찰", "활력", "기력", "컨디션", "특이사항"],
        scaleType: "ENERGY_3",
      },
    });
    await relabelEnergyPresets(prisma);
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.event.updateMany({
      where: { eventTypeId: energy.id },
      data: { eventTypeId: observation.id },
    });

    const energyPresets = await tx.preset.findMany({
      where: { eventTypeId: energy.id, archivedAt: null },
    });

    for (const preset of energyPresets) {
      const duplicate = await tx.preset.findFirst({
        where: {
          householdId: preset.householdId,
          petId: preset.petId,
          eventTypeId: observation.id,
          archivedAt: null,
        },
      });

      if (duplicate) {
        await tx.preset.update({
          where: { id: preset.id },
          data: { archivedAt: new Date() },
        });
        continue;
      }

      await tx.preset.update({
        where: { id: preset.id },
        data: { eventTypeId: observation.id, label: "eventType.observation" },
      });
    }

    await tx.reminder.updateMany({
      where: { eventTypeId: energy.id },
      data: { eventTypeId: observation.id },
    });

    await tx.apiToken.updateMany({
      where: { eventTypeId: energy.id },
      data: { eventTypeId: observation.id },
    });

    await tx.eventType.update({
      where: { id: energy.id },
      data: { archivedAt: new Date() },
    });
  });

  await relabelEnergyPresets(prisma);
}
