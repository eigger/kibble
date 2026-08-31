import type { FastifyInstance } from "fastify";
import { createPetSchema } from "@kibble/shared";
import { prisma } from "../lib/prisma.js";
import { t } from "../lib/i18n.js";
import { householdWhere, requireHouseholdId, requireHouseholdWrite } from "../lib/householdScope.js";
import {
  ensurePresetsForPetInTx,
  SystemEventTypesNotSeededError,
} from "../lib/seed/ensurePresetsForPet.js";

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
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const parsed = createPetSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { name, species } = parsed.data;
    try {
      const pet = await prisma.$transaction(async (tx) => {
        const created = await tx.pet.create({
          data: { householdId, name, species },
          select: { id: true, name: true, species: true, sortOrder: true },
        });
        await ensurePresetsForPetInTx(tx, householdId, created.id, species);
        return created;
      });
      return reply.code(201).send(pet);
    } catch (err) {
      if (err instanceof SystemEventTypesNotSeededError) {
        return reply.code(503).send({ error: t("systemEventTypesNotSeeded", request.locale) });
      }
      throw err;
    }
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
