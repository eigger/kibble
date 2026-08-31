import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { householdWhere, requireHouseholdId } from "../lib/householdScope.js";

/** 홈 화면용 — 첫 반려동물 + 해당 프리셋을 한 번에 반환한다. */
export async function homeRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdId(request, reply);
    if (!householdId) return;

    const pets = await prisma.pet.findMany({
      where: { ...householdWhere(householdId), archivedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, species: true, sortOrder: true },
    });

    const activePet = pets[0] ?? null;
    const presets = activePet
      ? await prisma.preset.findMany({
          where: {
            ...householdWhere(householdId),
            petId: activePet.id,
            archivedAt: null,
            hiddenAt: null,
          },
          orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
          select: { id: true, petId: true, label: true, isStarter: true, sortOrder: true },
        })
      : [];

    return { activePet, presets };
  });
}
