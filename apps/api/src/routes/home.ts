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
import { medicationCoursesWithProgress, todayDoseTargets } from "../lib/medicationCourseProgress.js";
import { timelineEventSelect } from "../services/createEvent.js";
import { routineSelect, serializeRoutine } from "./routines.js";

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
        routines: [],
        todaySummary: [],
        recentEvents: [],
        activeMedicationCourses: [],
        upcomingMedicationCourses: [],
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

    const [presets, routines, todaySummary, recentEvents, journalStats, medicationCourses] =
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
      // 루틴 — /q 루틴 패널 (§7.24). 사용자가 만든 것만 있으므로 보통 비어 있다
      prisma.routine.findMany({
        where: { ...householdWhere(householdId), petId: activePet.id, archivedAt: null },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: routineSelect,
      }),
      todaySummaryForPet(prisma, householdId, activePet.id),
      prisma.event.findMany({
        where: { ...petScope, deletedAt: null },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: 6,
        select: timelineEventSelect,
      }),
      journalStatsForPet(prisma, householdId, activePet.id),
      medicationCoursesWithProgress(prisma, householdId, activePet.id),
    ]);

    // 시작 전 처방은 오늘 복약 대상이 아니다 (케어 화면에는 "예정"으로 보인다)
    const activeMedicationCourses = todayDoseTargets(medicationCourses).map((course) => ({
      id: course.id,
      name: course.name,
      dosesPerDay: course.dosesPerDay,
      doseTimes: course.doseTimes,
      doseSlotsToday: course.doseSlotsToday,
      dosesGivenToday: course.dosesGivenToday,
      // 오프라인 스냅샷이 종료일을 넘긴 처방을 걸러 내는 데 쓴다 (기존 필드 의미는 그대로)
      endDate: course.endDate,
    }));

    // 오프라인 스냅샷용 — 시작 전 처방의 최소 필드만(startDate와 함께). 클라이언트가 시작일에 맞춰
    // 활성으로 본다. `activeMedicationCourses`의 의미는 그대로다(오늘 대상만).
    const upcomingMedicationCourses = medicationCourses
      .filter((course) => course.upcoming)
      .map((course) => ({
        id: course.id,
        name: course.name,
        dosesPerDay: course.dosesPerDay,
        doseTimes: course.doseTimes,
        startDate: course.startDate,
      }));

    return {
      pets,
      activePet,
      presets,
      routines: routines.map((row) => serializeRoutine(row)),
      todaySummary,
      recentEvents,
      activeMedicationCourses,
      upcomingMedicationCourses,
      journalStats,
    };
  });
}
