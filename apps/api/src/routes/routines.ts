import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { createRoutineSchema, updateRoutineSchema, type RoutineItemInput } from "@kibble/shared";
import { prisma } from "../lib/prisma.js";
import { t } from "../lib/i18n.js";
import { householdWhere, requireHouseholdId, requireHouseholdWrite } from "../lib/householdScope.js";

/**
 * 루틴 — 미리 정한 값으로 1탭 저장 (WORKPLAN §7.24).
 * 저장 자체는 클라이언트가 항목마다 `POST /api/events`를 부른다 (K-4, 오프라인 큐가 건별이라 R155).
 * 여기는 정의의 CRUD만.
 */

export const routineSelect = {
  id: true,
  petId: true,
  label: true,
  sortOrder: true,
  items: {
    orderBy: { sortOrder: "asc" as const },
    select: {
      id: true,
      sortOrder: true,
      eventTypeId: true,
      presetId: true,
      productId: true,
      productName: true,
      quantity: true,
      unit: true,
      eventType: { select: { key: true, label: true, category: true, defaultUnit: true } },
      preset: { select: { id: true, label: true } },
      product: { select: { id: true, name: true } },
    },
  },
} as const;

type RoutineRow = Prisma.RoutineGetPayload<{ select: typeof routineSelect }>;

export function serializeRoutine(row: RoutineRow) {
  return {
    id: row.id,
    petId: row.petId,
    label: row.label,
    sortOrder: row.sortOrder,
    items: row.items.map((item) => ({
      id: item.id,
      sortOrder: item.sortOrder,
      eventTypeId: item.eventTypeId,
      presetId: item.presetId,
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity != null ? item.quantity.toNumber() : null,
      unit: item.unit,
      eventType: item.eventType,
      preset: item.preset,
      product: item.product,
    })),
  };
}

async function findActiveRoutine(householdId: string, id: string) {
  return prisma.routine.findFirst({
    where: { id, ...householdWhere(householdId), archivedAt: null },
    select: routineSelect,
  });
}

type ItemCheckError = "eventTypeNotFound" | "presetNotFound" | "productNotFound";

/**
 * 항목이 가리키는 타입·칩·제품이 전부 이 가구·이 반려동물의 것인지 (K-1).
 * 투약은 처방·회차가 끼어 1탭이 안 되므로 받지 않는다 (§7.24).
 */
async function checkItems(
  householdId: string,
  petId: string,
  items: RoutineItemInput[],
): Promise<ItemCheckError | null> {
  const eventTypeIds = [...new Set(items.map((i) => i.eventTypeId))];
  const eventTypes = await prisma.eventType.findMany({
    where: {
      id: { in: eventTypeIds },
      householdId: null,
      archivedAt: null,
      key: { not: "medication" },
    },
    select: { id: true },
  });
  if (eventTypes.length !== eventTypeIds.length) return "eventTypeNotFound";

  const presetIds = [...new Set(items.map((i) => i.presetId).filter((v): v is string => !!v))];
  if (presetIds.length > 0) {
    const presets = await prisma.preset.findMany({
      where: { id: { in: presetIds }, ...householdWhere(householdId), petId, archivedAt: null },
      select: { id: true, eventTypeId: true },
    });
    if (presets.length !== presetIds.length) return "presetNotFound";
    const byId = new Map(presets.map((p) => [p.id, p.eventTypeId]));
    for (const item of items) {
      if (item.presetId && byId.get(item.presetId) !== item.eventTypeId) return "presetNotFound";
    }
  }

  const productIds = [...new Set(items.map((i) => i.productId).filter((v): v is string => !!v))];
  if (productIds.length > 0) {
    const count = await prisma.product.count({
      where: {
        id: { in: productIds },
        ...householdWhere(householdId),
        archivedAt: null,
        OR: [{ petId: null }, { petId }],
      },
    });
    if (count !== productIds.length) return "productNotFound";
  }

  return null;
}

function itemRows(householdId: string, items: RoutineItemInput[]) {
  return items.map((item, index) => ({
    householdId,
    sortOrder: index,
    eventTypeId: item.eventTypeId,
    presetId: item.presetId ?? null,
    productId: item.productId ?? null,
    productName: item.productName?.trim() || null,
    quantity: item.quantity ?? null,
    unit: item.unit?.trim() || null,
  }));
}

export async function routineRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdId(request, reply);
    if (!householdId) return;

    const query = request.query as { petId?: unknown };
    const petId = typeof query.petId === "string" ? query.petId.trim() : "";
    if (query.petId !== undefined && !petId) return reply.code(400).send({ error: "invalid petId" });

    const rows = await prisma.routine.findMany({
      where: { ...householdWhere(householdId), archivedAt: null, ...(petId ? { petId } : {}) },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: routineSelect,
    });
    return rows.map(serializeRoutine);
  });

  app.post("/", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const parsed = createRoutineSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { petId, label, sortOrder, items } = parsed.data;

    const pet = await prisma.pet.findFirst({
      where: { id: petId, ...householdWhere(householdId), archivedAt: null },
      select: { id: true },
    });
    if (!pet) return reply.code(404).send({ error: t("petNotFound", request.locale) });

    const itemError = await checkItems(householdId, petId, items);
    if (itemError) return reply.code(404).send({ error: t(itemError, request.locale) });

    const maxSort = await prisma.routine.aggregate({
      where: { ...householdWhere(householdId), petId, archivedAt: null },
      _max: { sortOrder: true },
    });

    const created = await prisma.routine.create({
      data: {
        householdId,
        petId,
        label,
        sortOrder: sortOrder ?? (maxSort._max.sortOrder ?? 0) + 1,
        items: { create: itemRows(householdId, items) },
      },
      select: routineSelect,
    });
    return reply.code(201).send(serializeRoutine(created));
  });

  app.patch("/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const { id } = request.params as { id: string };
    const parsed = updateRoutineSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const data = parsed.data;

    const existing = await prisma.routine.findFirst({
      where: { id, ...householdWhere(householdId), archivedAt: null },
      select: { id: true, petId: true },
    });
    if (!existing) return reply.code(404).send({ error: t("routineNotFound", request.locale) });

    if (data.items) {
      const itemError = await checkItems(householdId, existing.petId, data.items);
      if (itemError) return reply.code(404).send({ error: t(itemError, request.locale) });
    }

    await prisma.$transaction(async (tx) => {
      // updateMany + householdId — 다른 가구의 id가 섞여도 아무것도 바꾸지 않는다 (K-1)
      await tx.routine.updateMany({
        where: { id, ...householdWhere(householdId), archivedAt: null },
        data: {
          ...(data.label !== undefined ? { label: data.label } : {}),
          ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        },
      });
      if (data.items) {
        await tx.routineItem.deleteMany({
          where: { routineId: id, ...householdWhere(householdId) },
        });
        await tx.routineItem.createMany({
          data: itemRows(householdId, data.items).map((row) => ({ ...row, routineId: id })),
        });
      }
    });

    const row = await findActiveRoutine(householdId, id);
    if (!row) return reply.code(404).send({ error: t("routineNotFound", request.locale) });
    return serializeRoutine(row);
  });

  app.delete("/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const { id } = request.params as { id: string };
    const archived = await prisma.routine.updateMany({
      where: { id, ...householdWhere(householdId), archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (archived.count === 0) {
      return reply.code(404).send({ error: t("routineNotFound", request.locale) });
    }
    return reply.code(204).send();
  });
}
