import type { EventCategory, PrismaClient, ScaleType, Species } from "@prisma/client";

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
    key: "medication",
    label: "eventType.medication",
    icon: "pill",
    color: "violet",
    category: "HEALTH",
    aliases: ["약", "투약", "복약"],
    sortOrder: 70,
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

/** 시스템 EventType을 findFirst → create로 멱등 시드한다. upsert는 NULL unique 때문에 불가(§1.1). */
export async function seedSystemEventTypes(prisma: PrismaClient): Promise<number> {
  let created = 0;

  for (const row of SYSTEM_EVENT_TYPES) {
    const existing = await prisma.eventType.findFirst({
      where: { householdId: null, key: row.key },
    });
    if (existing) continue;

    await prisma.eventType.create({
      data: {
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
      },
    });
    created += 1;
  }

  return created;
}
