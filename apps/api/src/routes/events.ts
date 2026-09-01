import type { FastifyInstance } from "fastify";
import { createEventSchema, updateEventSchema } from "@kibble/shared";
import { prisma } from "../lib/prisma.js";
import { t } from "../lib/i18n.js";
import { householdWhere, requireHouseholdId, requireHouseholdWrite } from "../lib/householdScope.js";
import {
  requireEventCreateAccess,
  resolveTokenScopedField,
  sessionUserId,
  touchApiTokenLastUsed,
} from "../lib/authenticate.js";
import {
  createEvent,
  CreateEventNotFoundError,
  CreateEventValidationError,
  eventSelect,
  eventWithRelationsSelect,
  validateScaleValue,
} from "../services/createEvent.js";
import type { EventSource } from "@prisma/client";

async function resolveDefaultPetId(householdId: string): Promise<string | null> {
  const pet = await prisma.pet.findFirst({
    where: { ...householdWhere(householdId), archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true },
  });
  return pet?.id ?? null;
}

function mapSource(raw: string | undefined, authMethod: "jwt" | "apiToken"): EventSource {
  if (authMethod === "apiToken") return "API";
  if (raw === "QUICK") return "QUICK";
  return "WEB";
}

export async function eventRoutes(app: FastifyInstance) {
  app.post(
    "/",
    {
      preHandler: [app.authenticate],
      config: {
        allowApiToken: true,
        rateLimit: { max: 120, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      if (!requireEventCreateAccess(request, reply)) return;

      const householdId = request.householdId!;
      const parsed = createEventSchema.safeParse(request.body ?? {});
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

      const body = parsed.data;
      const tokenCtx = request.apiTokenContext;

      const petScope = resolveTokenScopedField(body.petId, tokenCtx?.petId);
      const presetScope = resolveTokenScopedField(body.presetId, tokenCtx?.presetId);
      const typeScope = resolveTokenScopedField(body.eventTypeId, tokenCtx?.eventTypeId);
      if (petScope.mismatch || presetScope.mismatch || typeScope.mismatch) {
        return reply.code(403).send({ error: t("forbidden", request.locale) });
      }

      let petId = petScope.value ?? null;
      if (!petId) petId = await resolveDefaultPetId(householdId);
      if (!petId) {
        return reply.code(400).send({ error: t("petRequiredForEvent", request.locale) });
      }

      const presetId = presetScope.value;
      const eventTypeId = typeScope.value;

      if (!presetId && !eventTypeId) {
        return reply.code(400).send({ error: t("eventTargetRequired", request.locale) });
      }

      try {
        const event = await createEvent(prisma, {
          householdId,
          petId,
          presetId: presetId ?? null,
          eventTypeId,
          occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
          quantity: body.quantity,
          quantityOffered: body.quantityOffered,
          unit: body.unit,
          scaleValue: body.scaleValue,
          note: body.note,
          rawText: body.rawText,
          entryId: body.entryId,
          needsReview: body.needsReview,
          source: mapSource(body.source, request.authMethod),
          createdById: sessionUserId(request),
          dedupeKey: body.dedupeKey ?? null,
        });

        if (request.authMethod === "apiToken" && request.apiTokenContext) {
          void touchApiTokenLastUsed(request.apiTokenContext.id);
        }

        const enriched = await prisma.event.findFirst({
          where: { id: event.id, ...householdWhere(householdId) },
          select: eventWithRelationsSelect,
        });

        return reply.code(201).send(enriched ?? event);
      } catch (err) {
        if (err instanceof CreateEventNotFoundError) {
          const key =
            err.field === "pet"
              ? "petNotFound"
              : err.field === "preset"
                ? "presetNotFound"
                : "eventTypeNotFound";
          return reply.code(404).send({ error: t(key, request.locale) });
        }
        if (err instanceof CreateEventValidationError) {
          if (
            err.message === "SCALE_VALUE_OUT_OF_RANGE" ||
            err.message === "SCALE_VALUE_NOT_ALLOWED" ||
            err.message === "SCALE_VALUE_INVALID"
          ) {
            return reply.code(400).send({ error: t("scaleValueInvalid", request.locale) });
          }
          return reply.code(400).send({ error: t("eventTargetRequired", request.locale) });
        }
        throw err;
      }
    },
  );

  app.get("/", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdId(request, reply);
    if (!householdId) return;

    const query = request.query as {
      petId?: string;
      limit?: string;
      before?: string;
      beforeId?: string;
    };
    const petId = query.petId?.trim();
    if (!petId) return reply.code(400).send({ error: t("petIdRequired", request.locale) });

    const pet = await prisma.pet.findFirst({
      where: { id: petId, ...householdWhere(householdId), archivedAt: null },
      select: { id: true },
    });
    if (!pet) return reply.code(404).send({ error: t("petNotFound", request.locale) });

    const limitRaw = query.limit ? Number(query.limit) : 30;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 100) : 30;
    const beforeAt = query.before ? new Date(query.before) : null;
    if (beforeAt && Number.isNaN(beforeAt.getTime())) {
      return reply.code(400).send({ error: t("invalidCursor", request.locale) });
    }
    const beforeId = query.beforeId?.trim();

    const cursorFilter =
      beforeAt && beforeId
        ? {
            OR: [{ occurredAt: { lt: beforeAt } }, { occurredAt: beforeAt, id: { lt: beforeId } }],
          }
        : beforeAt
          ? { occurredAt: { lt: beforeAt } }
          : {};

    const events = await prisma.event.findMany({
      where: {
        petId,
        ...householdWhere(householdId),
        deletedAt: null,
        ...cursorFilter,
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: limit,
      select: {
        ...eventSelect,
        eventType: { select: { key: true, label: true, icon: true, color: true, scaleType: true } },
        preset: { select: { id: true, label: true } },
      },
    });

    return events;
  });

  app.patch("/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const { id } = request.params as { id: string };
    const parsed = updateEventSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const data = parsed.data;
    const updateData: Record<string, unknown> = {};
    if (data.occurredAt !== undefined) updateData.occurredAt = new Date(data.occurredAt);
    if (data.quantity !== undefined) updateData.quantity = data.quantity;
    if (data.quantityOffered !== undefined) updateData.quantityOffered = data.quantityOffered;
    if (data.unit !== undefined) updateData.unit = data.unit;
    if (data.scaleValue !== undefined) updateData.scaleValue = data.scaleValue;
    if (data.note !== undefined) updateData.note = data.note;
    if (data.needsReview !== undefined) updateData.needsReview = data.needsReview;

    if (data.scaleValue !== undefined && data.scaleValue !== null) {
      const row = await prisma.event.findFirst({
        where: { id, ...householdWhere(householdId), deletedAt: null },
        select: { eventType: { select: { scaleType: true } } },
      });
      if (!row) return reply.code(404).send({ error: t("eventNotFound", request.locale) });
      try {
        validateScaleValue(row.eventType.scaleType, data.scaleValue);
      } catch {
        return reply.code(400).send({ error: t("scaleValueInvalid", request.locale) });
      }
    }

    const updated = await prisma.event.updateMany({
      where: { id, ...householdWhere(householdId), deletedAt: null },
      data: updateData,
    });
    if (updated.count === 0) {
      return reply.code(404).send({ error: t("eventNotFound", request.locale) });
    }
    const event = await prisma.event.findFirst({
      where: { id, ...householdWhere(householdId) },
      select: eventSelect,
    });
    return event;
  });

  app.delete("/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const { id } = request.params as { id: string };
    const deleted = await prisma.event.updateMany({
      where: { id, ...householdWhere(householdId), deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (deleted.count === 0) {
      return reply.code(404).send({ error: t("eventNotFound", request.locale) });
    }
    return reply.code(204).send();
  });

  app.post("/:id/restore", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const { id } = request.params as { id: string };
    const existing = await prisma.event.findFirst({
      where: { id, ...householdWhere(householdId), deletedAt: { not: null } },
      select: { id: true },
    });
    if (!existing) return reply.code(404).send({ error: t("eventNotFound", request.locale) });

    const event = await prisma.event.update({
      where: { id },
      data: { deletedAt: null },
      select: eventSelect,
    });
    return event;
  });
}
