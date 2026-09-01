import type { EventCategory, Prisma, PrismaClient, ScaleType, Species } from "@prisma/client";
import { isUniqueConstraintError } from "../prismaErrors.js";
import { migrateEnergyToObservation } from "./migrateEnergyToObservation.js";

export type SystemEventTypeSeed = {
  key: string;
  label: string;
  icon: string;
  color: string;
  category: EventCategory;
  defaultUnit?: string;
  species?: Species;
  aliases: string[];
  scaleType?: ScaleType;
  sortOrder: number;
};

/** docs/seed-event-types.md §2.1–2.3 — 시스템 EventType 정의 */
export const SYSTEM_EVENT_TYPES: SystemEventTypeSeed[] = [
  {
    key: "meal",
    label: "eventType.meal",
    icon: "utensils",
    color: "amber",
    category: "FEEDING",
    defaultUnit: "g",
    aliases: ["밥", "사료", "급여", "먹이"],
    sortOrder: 10,
  },
  {
    key: "water",
    label: "eventType.water",
    icon: "droplet",
    color: "sky",
    category: "FEEDING",
    defaultUnit: "ml",
    aliases: ["물", "급수", "정수"],
    sortOrder: 20,
  },
  {
    key: "treat",
    label: "eventType.treat",
    icon: "cookie",
    color: "orange",
    category: "FEEDING",
    aliases: ["간식", "츄르", "스낵"],
    sortOrder: 30,
  },
  {
    key: "supplement",
    label: "eventType.supplement",
    icon: "pill",
    color: "emerald",
    category: "FEEDING",
    aliases: ["영양제", "유산균", "오메가", "영양"],
    sortOrder: 35,
  },
  {
    key: "poop",
    label: "eventType.poop",
    icon: "circle-dot",
    color: "amber-900",
    category: "EXCRETION",
    scaleType: "FECAL_7",
    aliases: ["대변", "똥", "변", "응가"],
    sortOrder: 40,
  },
  {
    key: "pee",
    label: "eventType.pee",
    icon: "droplets",
    color: "yellow",
    category: "EXCRETION",
    scaleType: "URINE_AMOUNT_3",
    aliases: ["소변", "쉬", "오줌"],
    sortOrder: 50,
  },
  {
    key: "vomit",
    label: "eventType.vomit",
    icon: "frown",
    color: "rose",
    category: "HEALTH",
    aliases: ["구토", "토", "역류"],
    sortOrder: 60,
  },
  {
    key: "dental",
    label: "eventType.dental",
    icon: "sparkles",
    color: "cyan",
    category: "HEALTH",
    aliases: ["양치", "치아", "덴탈"],
    sortOrder: 65,
  },
  {
    key: "observation",
    label: "eventType.observation",
    icon: "eye",
    color: "teal",
    category: "HEALTH",
    scaleType: "ENERGY_3",
    aliases: ["관찰", "활력", "기력", "컨디션", "특이사항"],
    sortOrder: 72,
  },
  {
    key: "medication",
    label: "eventType.medication",
    icon: "pill",
    color: "violet",
    category: "MEDICAL",
    aliases: ["약", "투약", "복약"],
    sortOrder: 115,
  },
  {
    key: "weight",
    label: "eventType.weight",
    icon: "scale",
    color: "slate",
    category: "HEALTH",
    defaultUnit: "kg",
    aliases: ["체중", "몸무게"],
    sortOrder: 80,
  },
  {
    key: "symptom",
    label: "eventType.symptom",
    icon: "stethoscope",
    color: "red",
    category: "HEALTH",
    aliases: [],
    sortOrder: 90,
  },
  {
    key: "play",
    label: "eventType.play",
    icon: "gamepad-2",
    color: "green",
    category: "ACTIVITY",
    defaultUnit: "min",
    aliases: [],
    sortOrder: 100,
  },
  {
    key: "grooming",
    label: "eventType.grooming",
    icon: "scissors",
    color: "pink",
    category: "CARE",
    aliases: [],
    sortOrder: 110,
  },
  {
    key: "vet_visit",
    label: "eventType.vet_visit",
    icon: "hospital",
    color: "blue",
    category: "MEDICAL",
    aliases: ["병원", "진료", "검진"],
    sortOrder: 120,
  },
  {
    key: "vaccination",
    label: "eventType.vaccination",
    icon: "syringe",
    color: "indigo",
    category: "MEDICAL",
    aliases: [],
    sortOrder: 130,
  },
  {
    key: "note",
    label: "eventType.note",
    icon: "sticky-note",
    color: "gray",
    category: "NOTE",
    aliases: [],
    sortOrder: 999,
  },
  {
    key: "walk",
    label: "eventType.walk",
    icon: "footprints",
    color: "lime",
    category: "ACTIVITY",
    species: "DOG",
    defaultUnit: "min",
    aliases: ["산책", "산책함"],
    sortOrder: 95,
  },
  {
    key: "litter_change",
    label: "eventType.litter_change",
    icon: "box",
    color: "stone",
    category: "CARE",
    species: "CAT",
    aliases: [],
    sortOrder: 115,
  },
];

function seedData(row: SystemEventTypeSeed): Prisma.EventTypeUncheckedCreateInput {
  return {
    householdId: null,
    key: row.key,
    label: row.label,
    icon: row.icon,
    color: row.color,
    category: row.category,
    defaultUnit: row.defaultUnit ?? null,
    species: row.species ?? null,
    aliases: row.aliases,
    scaleType: row.scaleType ?? null,
    sortOrder: row.sortOrder,
  };
}

function seedUpdate(row: SystemEventTypeSeed): Prisma.EventTypeUpdateInput {
  return {
    label: row.label,
    icon: row.icon,
    color: row.color,
    category: row.category,
    defaultUnit: row.defaultUnit ?? null,
    species: row.species ?? null,
    aliases: row.aliases,
    scaleType: row.scaleType ?? null,
    sortOrder: row.sortOrder,
    archivedAt: null,
  };
}

/** 시스템 EventType 시드 — 없으면 create, 있으면 메타데이터 update (K-8). */
export async function seedSystemEventTypes(
  prisma: PrismaClient,
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  await migrateEnergyToObservation(prisma);

  for (const row of SYSTEM_EVENT_TYPES) {
    const existing = await prisma.eventType.findFirst({
      where: { householdId: null, key: row.key },
    });

    if (existing) {
      await prisma.eventType.update({
        where: { id: existing.id },
        data: seedUpdate(row),
      });
      updated += 1;
      continue;
    }

    try {
      await prisma.eventType.create({ data: seedData(row) });
      created += 1;
    } catch (err) {
      if (isUniqueConstraintError(err)) continue;
      throw err;
    }
  }

  const supplement = await prisma.eventType.findFirst({
    where: { householdId: null, key: "supplement" },
    select: { id: true },
  });
  if (supplement) {
    await prisma.preset.updateMany({
      where: { eventTypeId: supplement.id, archivedAt: { not: null } },
      data: { archivedAt: null },
    });
  }

  return { created, updated };
}
