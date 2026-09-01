import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { householdWhere, requireHouseholdId } from "../lib/householdScope.js";
import { t } from "../lib/i18n.js";
import { todaySummaryForPet } from "../lib/todaySummary.js";
import { journalStatsForPet } from "../lib/journalStats.js";
import {
  ensurePresetsForPet,
  SystemEventTypesNotSeededError,
} from "../lib/seed/ensurePresetsForPet.js";
import { medicationCoursesWithProgress } from "../lib/medicationCourseProgress.js";

const recentEventSelect = {
  id: true,
  occurredAt: true,
  quantity: true,
  quantityOffered: true,
  unit: true,
  scaleValue: true,
  productName: true,
  note: true,
  preset: { select: { id: true, label: true } },
  contact: { select: { id: true, name: true, address: true } },
  course: { select: { id: true, name: true } },
  eventType: { select: { key: true, label: true, icon: true, scaleType: true, category: true } },
  attachments: {
    select: { id: true, path: true, mime: true, size: true, width: true, height: true },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

/** 홈 화면용 — 반려동물·프리셋·오늘 요약·최근 이벤트를 한 번에 반환한다. */
export async function homeRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdId(request, reply);
    if (!householdId) return;

    const query = request.query as { petId?: string };
    const requestedPetId = query.petId?.trim();

    const pets = await prisma.pet.findMany({
      where: { ...householdWhere(householdId), archivedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, species: true, sortOrder: true },
    });

    let activePet = pets[0] ?? null;
    if (requestedPetId) {
      const match = pets.find((p) => p.id === requestedPetId);
      if (!match) {
        return reply.code(404).send({ error: t("petNotFound", request.locale) });
      }
      activePet = match;
    }

    if (!activePet) {
      return {
        pets,
        activePet: null,
        presets: [],
        todaySummary: [],
        recentEvents: [],
        activeMedicationCourses: [],
        journalStats: { totalEventCount: 0, distinctDayCount: 0 },
      };
    }

    const petScope = {
      ...householdWhere(householdId),
      petId: activePet.id,
    };

    try {
      await ensurePresetsForPet(prisma, householdId, activePet.id, activePet.species);
    } catch (err) {
      if (!(err instanceof SystemEventTypesNotSeededError)) throw err;
    }

    const [presets, todaySummary, recentEvents, journalStats, medicationCourses] =
      await Promise.all([
      prisma.preset.findMany({
        where: {
          ...householdWhere(householdId),
          petId: activePet.id,
          archivedAt: null,
          hiddenAt: null,
        },
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
        select: {
          id: true,
          petId: true,
          label: true,
          isStarter: true,
          sortOrder: true,
          eventType: { select: { key: true, scaleType: true, category: true } },
        },
      }),
      todaySummaryForPet(prisma, householdId, activePet.id),
      prisma.event.findMany({
        where: { ...petScope, deletedAt: null },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: 6,
        select: recentEventSelect,
      }),
      journalStatsForPet(prisma, householdId, activePet.id),
      medicationCoursesWithProgress(prisma, householdId, activePet.id),
    ]);

    const activeMedicationCourses = medicationCourses.map((course) => ({
      id: course.id,
      name: course.name,
      dosesPerDay: course.dosesPerDay,
      doseTimes: course.doseTimes,
      doseSlotsToday: course.doseSlotsToday,
      dosesGivenToday: course.dosesGivenToday,
    }));

    return {
      pets,
      activePet,
      presets,
      todaySummary,
      recentEvents,
      activeMedicationCourses,
      journalStats,
    };
  });
}
