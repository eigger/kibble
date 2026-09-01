import type { FastifyInstance } from "fastify";
import { createApiTokenSchema } from "@kibble/shared";
import { prisma } from "../lib/prisma.js";
import { t } from "../lib/i18n.js";
import { householdWhere, requireHouseholdWrite } from "../lib/householdScope.js";
import { generateApiTokenPlaintext, hashApiToken } from "../lib/apiToken.js";
import { isRecordNotFoundError } from "../lib/prismaErrors.js";

const EVENT_CREATE_SCOPE = "event:create";

export async function apiTokenRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const tokens = await prisma.apiToken.findMany({
      where: { ...householdWhere(householdId), revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        scopes: true,
        presetId: true,
        petId: true,
        eventTypeId: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
        preset: { select: { label: true } },
        pet: { select: { name: true } },
      },
    });
    return tokens;
  });

  app.post("/", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const parsed = createApiTokenSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { name, presetId, petId, eventTypeId, expiresAt } = parsed.data;

    if (presetId) {
      const preset = await prisma.preset.findFirst({
        where: { id: presetId, ...householdWhere(householdId), archivedAt: null },
        select: { id: true },
      });
      if (!preset) return reply.code(404).send({ error: t("presetNotFound", request.locale) });
    }

    if (petId) {
      const pet = await prisma.pet.findFirst({
        where: { id: petId, ...householdWhere(householdId), archivedAt: null },
        select: { id: true },
      });
      if (!pet) return reply.code(404).send({ error: t("petNotFound", request.locale) });
    }

    if (eventTypeId) {
      const eventType = await prisma.eventType.findFirst({
        where: {
          id: eventTypeId,
          OR: [{ householdId: null }, { householdId }],
          archivedAt: null,
        },
        select: { id: true },
      });
      if (!eventType) return reply.code(404).send({ error: t("eventTypeNotFound", request.locale) });
    }

    const plaintext = generateApiTokenPlaintext();
    const tokenHash = hashApiToken(plaintext);

    const row = await prisma.apiToken.create({
      data: {
        householdId,
        name,
        tokenHash,
        scopes: [EVENT_CREATE_SCOPE],
        presetId: presetId ?? null,
        petId: petId ?? null,
        eventTypeId: eventTypeId ?? null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
      select: {
        id: true,
        name: true,
        scopes: true,
        presetId: true,
        petId: true,
        eventTypeId: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    return reply.code(201).send({ ...row, token: plaintext });
  });

  app.delete("/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const { id } = request.params as { id: string };
    try {
      await prisma.apiToken.update({
        where: { id, ...householdWhere(householdId), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch (err) {
      if (isRecordNotFoundError(err)) {
        return reply.code(404).send({ error: t("apiTokenNotFound", request.locale) });
      }
      throw err;
    }
    return reply.code(204).send();
  });
}
