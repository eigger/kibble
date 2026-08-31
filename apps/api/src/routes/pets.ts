import type { FastifyInstance } from "fastify";
import { createPetSchema } from "@kibble/shared";
import { prisma } from "../lib/prisma.js";
import { householdWhere, requireHouseholdId } from "../lib/householdScope.js";
import { ensurePresetsForPet } from "../lib/seed/ensurePresetsForPet.js";

export async function petRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdId(request, reply);
    if (!householdId) return;

    const pets = await prisma.pet.findMany({
      where: { ...householdWhere(householdId), archivedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, species: true, sortOrder: true },
    });
    return pets;
  });

  app.post("/", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdId(request, reply);
    if (!householdId) return;

    const parsed = createPetSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { name, species } = parsed.data;
    const pet = await prisma.pet.create({
      data: { householdId, name, species },
      select: { id: true, name: true, species: true, sortOrder: true },
    });

    await ensurePresetsForPet(prisma, householdId, pet.id, species);

    return reply.code(201).send(pet);
  });
}

export async function onboardingRoutes(app: FastifyInstance) {
  app.get("/status", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdId(request, reply);
    if (!householdId) return;

    const petCount = await prisma.pet.count({
      where: { ...householdWhere(householdId), archivedAt: null },
    });

    return { householdId, needsPet: petCount === 0, petCount };
  });
}
