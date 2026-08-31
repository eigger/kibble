import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { householdWhere, requireHouseholdId } from "../lib/householdScope.js";

function parsePetIdQuery(raw: unknown): { petId?: string; invalid: boolean } {
  if (raw === undefined) return { invalid: false };
  if (typeof raw !== "string") return { invalid: true };
  const petId = raw.trim();
  if (!petId) return { invalid: true };
  return { petId, invalid: false };
}

export async function presetRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdId(request, reply);
    if (!householdId) return;

    const { petId, invalid } = parsePetIdQuery((request.query as { petId?: unknown }).petId);
    if (invalid) {
      return reply.code(400).send({ error: "invalid petId" });
    }

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
