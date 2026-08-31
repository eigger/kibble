import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireHouseholdId } from "../lib/householdScope.js";

export async function householdRoutes(app: FastifyInstance) {
  app.get("/me", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdId(request, reply);
    if (!householdId) return;

    const household = await prisma.household.findFirst({
      where: { id: householdId },
      select: { id: true, name: true, createdAt: true },
    });
    if (!household) return reply.code(404).send({ error: "household_not_found" });
    return household;
  });
}
