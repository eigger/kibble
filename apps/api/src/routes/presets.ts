import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { householdWhere, requireHouseholdId } from "../lib/householdScope.js";

export async function presetRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdId(request, reply);
    if (!householdId) return;

    const { petId } = request.query as { petId?: string };

    const presets = await prisma.preset.findMany({
      where: {
        ...householdWhere(householdId),
        archivedAt: null,
        hiddenAt: null,
        ...(petId ? { petId } : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      select: { id: true, petId: true, label: true, isStarter: true, sortOrder: true },
    });
    return presets;
  });
}
