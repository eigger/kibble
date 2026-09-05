import type { FastifyInstance } from "fastify";
import { createEventSchema, updateEventSchema, TIMELINE_PAGE_SIZE } from "@kibble/shared";
import { prisma } from "../lib/prisma.js";
import { t } from "../lib/i18n.js";
import { householdWhere, requireHouseholdId, requireHouseholdWrite } from "../lib/householdScope.js";
import { periodRangeFromQuery } from "../lib/kstPeriodRange.js";
import { assertPetInHousehold, listEventHistoryPeriods } from "../lib/historyPeriods.js";
import { productSuggestionsForPet } from "../lib/frequentProducts.js";
import { clinicSuggestionsForPet } from "../lib/frequentClinics.js";
import { upsertVetContact, type VetContactDetails } from "../lib/upsertVetContact.js";
import { resolveEventProductFields } from "../lib/eventProduct.js";
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

type ClinicInput = {
  clinicName?: string | null;
  clinicAddress?: string | null;
  clinicLatitude?: number | null;
  clinicLongitude?: number | null;
  clinicPlaceUrl?: string | null;
};

/** 좌표는 짝으로만 의미가 있다 — 하나만 온 요청은 좌표 없이 처리한다. */
function vetContactDetails(body: ClinicInput): VetContactDetails {
  const hasCoords = body.clinicLatitude != null && body.clinicLongitude != null;
  return {
    address: body.clinicAddress,
    latitude: hasCoords ? body.clinicLatitude : null,
    longitude: hasCoords ? body.clinicLongitude : null,
    placeUrl: body.clinicPlaceUrl,
  };
}

async function resolveClinicContactId(
  householdId: string,
  clinicName: string | null | undefined,
  details: VetContactDetails,
): Promise<string | null> {
  const name = clinicName?.trim();
  if (!name) return null;
  return upsertVetContact(prisma, householdId, name, details);
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
        let contactId: string | null | undefined = undefined;
        if (body.clinicName !== undefined) {
          contactId = await resolveClinicContactId(
            householdId,
            body.clinicName,
            vetContactDetails(body),
          );
        }

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
          productId: body.productId,
          productName: body.productName,
          contactId,
          costKrw: body.costKrw,
          note: body.note,
          rawText: body.rawText,
          entryId: body.entryId,
          needsReview: body.needsReview,
          source: mapSource(body.source, request.authMethod),
          createdById: sessionUserId(request),
          dedupeKey: body.dedupeKey ?? null,
          medicationCourseId: body.medicationCourseId ?? null,
          doseSlotIndex: body.doseSlotIndex ?? null,
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

  app.get("/history-periods", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdId(request, reply);
    if (!householdId) return;

    const query = request.query as { petId?: string };
    const petId = query.petId?.trim();
    if (!petId) return reply.code(400).send({ error: t("petIdRequired", request.locale) });

    if (!(await assertPetInHousehold(prisma, householdId, petId))) {
      return reply.code(404).send({ error: t("petNotFound", request.locale) });
    }

    return listEventHistoryPeriods(prisma, householdId, petId);
  });

  app.get("/product-suggestions", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdId(request, reply);
    if (!householdId) return;

    const query = request.query as { petId?: string; eventTypeKey?: string };
    const petId = query.petId?.trim();
    const eventTypeKey = query.eventTypeKey?.trim();
    if (!petId) return reply.code(400).send({ error: t("petIdRequired", request.locale) });
    if (!eventTypeKey) {
      return reply.code(400).send({ error: t("eventTypeKeyRequired", request.locale) });
    }

    if (!(await assertPetInHousehold(prisma, householdId, petId))) {
      return reply.code(404).send({ error: t("petNotFound", request.locale) });
    }

    return productSuggestionsForPet(prisma, {
      householdId,
      petId,
      eventTypeKey,
      userId: sessionUserId(request),
    });
  });

  app.get("/clinic-suggestions", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdId(request, reply);
    if (!householdId) return;

    const query = request.query as { petId?: string };
    const petId = query.petId?.trim();
    if (!petId) return reply.code(400).send({ error: t("petIdRequired", request.locale) });

    if (!(await assertPetInHousehold(prisma, householdId, petId))) {
      return reply.code(404).send({ error: t("petNotFound", request.locale) });
    }

    return clinicSuggestionsForPet(prisma, {
      householdId,
      petId,
      userId: sessionUserId(request),
    });
  });

  app.get("/", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdId(request, reply);
    if (!householdId) return;

    const query = request.query as {
      petId?: string;
      limit?: string;
      before?: string;
      beforeId?: string;
      period?: string;
      date?: string;
      eventTypeKey?: string;
    };
    const petId = query.petId?.trim();
    if (!petId) return reply.code(400).send({ error: t("petIdRequired", request.locale) });

    const pet = await prisma.pet.findFirst({
      where: { id: petId, ...householdWhere(householdId), archivedAt: null },
      select: { id: true },
    });
    if (!pet) return reply.code(404).send({ error: t("petNotFound", request.locale) });

    const periodRange = periodRangeFromQuery(query);
    if ((query.period?.trim() || query.date?.trim()) && !periodRange) {
      return reply.code(400).send({ error: t("invalidPeriod", request.locale) });
    }

    const limitRaw = query.limit ? Number(query.limit) : TIMELINE_PAGE_SIZE;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 100) : TIMELINE_PAGE_SIZE;
    const beforeAt = query.before ? new Date(query.before) : null;
    if (beforeAt && Number.isNaN(beforeAt.getTime())) {
      return reply.code(400).send({ error: t("invalidCursor", request.locale) });
    }
    const beforeId = query.beforeId?.trim();
    const eventTypeKey = query.eventTypeKey?.trim();

    const cursorFilter =
      beforeAt && beforeId
        ? {
            OR: [{ occurredAt: { lt: beforeAt } }, { occurredAt: beforeAt, id: { lt: beforeId } }],
          }
        : beforeAt
          ? { occurredAt: { lt: beforeAt } }
          : {};

    const periodFilter = periodRange
      ? { occurredAt: { gte: periodRange.gte, lt: periodRange.lt } }
      : {};

    const events = await prisma.event.findMany({
      where: {
        petId,
        ...householdWhere(householdId),
        deletedAt: null,
        ...periodFilter,
        ...cursorFilter,
        ...(eventTypeKey ? { eventType: { key: eventTypeKey } } : {}),
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: limit,
      select: {
        ...eventSelect,
        eventType: { select: { key: true, label: true, icon: true, color: true, scaleType: true, category: true } },
        product: eventWithRelationsSelect.product,
        preset: { select: { id: true, label: true } },
        contact: {
          select: {
            id: true,
            name: true,
            address: true,
            latitude: true,
            longitude: true,
            placeUrl: true,
          },
        },
        course: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        updatedBy: { select: { id: true, name: true } },
        attachments: {
          select: { id: true, path: true, mime: true, size: true, width: true, height: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return events;
  });

  // 단건 읽기. 토큰은 허용하지 않는다 — 토큰은 개체·프리셋 스코프인데 임의 id 읽기를
  // 열면 가구 안의 다른 기록까지 보인다. 밖에서 읽을 것은 GET /api/states다.
  app.get("/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdId(request, reply);
    if (!householdId) return;

    const { id } = request.params as { id: string };
    const event = await prisma.event.findFirst({
      where: { id, ...householdWhere(householdId), deletedAt: null },
      select: eventWithRelationsSelect,
    });
    if (!event) return reply.code(404).send({ error: t("eventNotFound", request.locale) });
    return event;
  });

  app.patch("/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const { id } = request.params as { id: string };
    const parsed = updateEventSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const data = parsed.data;
    const updateData: Record<string, unknown> = { updatedById: sessionUserId(request) };
    if (data.occurredAt !== undefined) updateData.occurredAt = new Date(data.occurredAt);
    if (data.quantity !== undefined) updateData.quantity = data.quantity;
    if (data.quantityOffered !== undefined) updateData.quantityOffered = data.quantityOffered;
    if (data.unit !== undefined) updateData.unit = data.unit;
    if (data.scaleValue !== undefined) updateData.scaleValue = data.scaleValue;
    if (data.productId !== undefined || data.productName !== undefined) {
      let householdProduct: { id: string; name: string } | null = null;
      const pid = data.productId?.trim() || null;
      if (pid) {
        householdProduct = await prisma.product.findFirst({
          where: { id: pid, ...householdWhere(householdId) },
          select: { id: true, name: true },
        });
      }
      const resolved = resolveEventProductFields({
        productId: data.productId,
        productName: data.productName,
        householdProduct,
      });
      if (resolved.productId !== undefined) updateData.productId = resolved.productId;
      if (resolved.productName !== undefined) updateData.productName = resolved.productName;
    }
    const clinicDetailsChanged =
      data.clinicAddress !== undefined ||
      data.clinicLatitude !== undefined ||
      data.clinicLongitude !== undefined ||
      data.clinicPlaceUrl !== undefined;
    if (data.clinicName !== undefined) {
      updateData.contactId = await resolveClinicContactId(
        householdId,
        data.clinicName,
        vetContactDetails(data),
      );
    } else if (clinicDetailsChanged) {
      // 이름을 안 보냈으면 기존 Contact의 이름을 그대로 두고 주소·좌표만 갱신한다.
      const row = await prisma.event.findFirst({
        where: { id, ...householdWhere(householdId), deletedAt: null },
        select: { contact: { select: { id: true, name: true } } },
      });
      if (!row) return reply.code(404).send({ error: t("eventNotFound", request.locale) });
      if (row.contact?.name) {
        updateData.contactId = await resolveClinicContactId(
          householdId,
          row.contact.name,
          vetContactDetails(data),
        );
      }
    }
    if (data.costKrw !== undefined) updateData.costKrw = data.costKrw;
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
      select: eventWithRelationsSelect,
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
