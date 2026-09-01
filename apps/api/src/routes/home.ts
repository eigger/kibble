import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { householdWhere, requireHouseholdId } from "../lib/householdScope.js";
import { t } from "../lib/i18n.js";
import { todaySummaryForPet } from "../lib/todaySummary.js";
import { journalStatsForPet } from "../lib/journalStats.js";
import { TIMELINE_PAGE_SIZE } from "@kibble/shared";

const recentEventSelect = {
  id: true,
  occurredAt: true,
  quantity: true,
  quantityOffered: true,
  unit: true,
  scaleValue: true,
  note: true,
  preset: { select: { id: true, label: true } },
  eventType: { select: { key: true, label: true, icon: true, scaleType: true } },
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
        journalStats: { totalEventCount: 0, distinctDayCount: 0 },
      };
    }

    const petScope = {
      ...householdWhere(householdId),
      petId: activePet.id,
    };

    const [presets, todaySummary, recentEvents, journalStats] = await Promise.all([
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
          eventType: { select: { scaleType: true } },
        },
      }),
      todaySummaryForPet(prisma, householdId, activePet.id),
      prisma.event.findMany({
        where: { ...petScope, deletedAt: null },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: TIMELINE_PAGE_SIZE,
        select: recentEventSelect,
      }),
      journalStatsForPet(prisma, householdId, activePet.id),
    ]);

    return { pets, activePet, presets, todaySummary, recentEvents, journalStats };
  });
}
