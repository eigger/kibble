import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { createRoutineSchema, updateRoutineSchema, type RoutineItemInput } from "@kibble/shared";
import { prisma } from "../lib/prisma.js";
import { t } from "../lib/i18n.js";
import { householdWhere, requireHouseholdId, requireHouseholdWrite } from "../lib/householdScope.js";
import { isMedicationCourseEnded } from "../lib/medicationCourseProgress.js";

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
      quantityOffered: true,
      unit: true,
      medicationCourseId: true,
      eventType: { select: { key: true, label: true, category: true, defaultUnit: true } },
      preset: { select: { id: true, label: true, archivedAt: true } },
      product: { select: { id: true, name: true } },
      course: { select: { id: true, name: true, endDate: true, archivedAt: true } },
    },
  },
} as const;

type RoutineRow = Prisma.RoutineGetPayload<{ select: typeof routineSelect }>;

export function serializeRoutine(row: RoutineRow, now = new Date()) {
  return {
    id: row.id,
    petId: row.petId,
    label: row.label,
    sortOrder: row.sortOrder,
    items: row.items.map((item) => {
      // 칩은 소프트 보관이라 FK SetNull이 안 걸린다 — 보관된 칩이면 없는 셈 치고 타입으로 저장하게 한다
      const preset = item.preset && !item.preset.archivedAt ? item.preset : null;
      return {
        id: item.id,
        sortOrder: item.sortOrder,
        eventTypeId: item.eventTypeId,
        presetId: preset?.id ?? null,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity != null ? item.quantity.toNumber() : null,
        quantityOffered: item.quantityOffered != null ? item.quantityOffered.toNumber() : null,
        unit: item.unit,
        eventType: item.eventType,
        preset: preset ? { id: preset.id, label: preset.label } : null,
        product: item.product,
        medicationCourseId: item.medicationCourseId,
        // 처방이 끝났거나 지워졌으면 실행 때 이 항목을 건너뛴다 (§7.24)
        course: item.course
          ? {
              id: item.course.id,
              name: item.course.name,
              ended: isMedicationCourseEnded(item.course, now),
            }
          : null,
      };
    }),
  };
}

async function findActiveRoutine(householdId: string, id: string) {
  return prisma.routine.findFirst({
    where: { id, ...householdWhere(householdId), archivedAt: null },
    select: routineSelect,
  });
}

type ItemCheckError =
  | "eventTypeNotFound"
  | "presetNotFound"
  | "productNotFound"
  | "medicationCourseNotFound";

/**
 * 항목이 가리키는 타입·칩·제품·처방이 전부 이 가구·이 반려동물의 것인지 (K-1).
 * 투약 항목은 진행 중인 처방이 필수다 — 회차 슬롯은 실행 때 서버가 고른다 (§7.24).
 */
async function checkItems(
  householdId: string,
  petId: string,
  items: RoutineItemInput[],
  /** 이 루틴이 이미 들고 있는 처방 — 끝났어도 그대로 둘 수 있다. 지울지는 사용자가 정한다 */
  keptCourseIds: ReadonlySet<string> = new Set(),
): Promise<{ error: ItemCheckError } | { medicationTypeIds: Set<string>; mealTypeIds: Set<string> }> {
  const eventTypeIds = [...new Set(items.map((i) => i.eventTypeId))];
  const eventTypes = await prisma.eventType.findMany({
    where: { id: { in: eventTypeIds }, householdId: null, archivedAt: null },
    select: { id: true, key: true },
  });
  if (eventTypes.length !== eventTypeIds.length) return { error: "eventTypeNotFound" };
  const medicationTypeIds = new Set(
    eventTypes.filter((type) => type.key === "medication").map((type) => type.id),
  );

  // 제공량은 사료만 — 편집 시트가 사료에만 그 칸을 둔다
  const mealTypeIds = new Set(eventTypes.filter((type) => type.key === "meal").map((type) => type.id));

  const courseIds: string[] = [];
  for (const item of items) {
    if (!medicationTypeIds.has(item.eventTypeId)) continue;
    if (!item.medicationCourseId) return { error: "medicationCourseNotFound" };
    courseIds.push(item.medicationCourseId);
  }
  const uniqueCourseIds = [...new Set(courseIds)];
  if (uniqueCourseIds.length > 0) {
    const courses = await prisma.medicationCourse.findMany({
      where: { id: { in: uniqueCourseIds }, ...householdWhere(householdId), petId },
      select: { id: true, endDate: true, archivedAt: true },
    });
    const now = new Date();
    const usable = courses.filter(
      (course) => keptCourseIds.has(course.id) || !isMedicationCourseEnded(course, now),
    );
    if (usable.length !== uniqueCourseIds.length) return { error: "medicationCourseNotFound" };
  }

  const presetIds = [...new Set(items.map((i) => i.presetId).filter((v): v is string => !!v))];
  if (presetIds.length > 0) {
    const presets = await prisma.preset.findMany({
      where: { id: { in: presetIds }, ...householdWhere(householdId), petId, archivedAt: null },
      select: { id: true, eventTypeId: true },
    });
    if (presets.length !== presetIds.length) return { error: "presetNotFound" };
    const byId = new Map(presets.map((p) => [p.id, p.eventTypeId]));
    for (const item of items) {
      if (item.presetId && byId.get(item.presetId) !== item.eventTypeId) {
        return { error: "presetNotFound" };
      }
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
    if (count !== productIds.length) return { error: "productNotFound" };
  }

  return { medicationTypeIds, mealTypeIds };
}

export function itemRows(
  householdId: string,
  items: RoutineItemInput[],
  medicationTypeIds: ReadonlySet<string>,
  mealTypeIds: ReadonlySet<string>,
) {
  return items.map((item, index) => ({
    householdId,
    sortOrder: index,
    eventTypeId: item.eventTypeId,
    presetId: item.presetId ?? null,
    productId: item.productId ?? null,
    productName: item.productName?.trim() || null,
    quantity: item.quantity ?? null,
    quantityOffered: mealTypeIds.has(item.eventTypeId) ? (item.quantityOffered ?? null) : null,
    unit: item.unit?.trim() || null,
    medicationCourseId: medicationTypeIds.has(item.eventTypeId)
      ? (item.medicationCourseId ?? null)
      : null,
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
    return rows.map((row) => serializeRoutine(row));
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

    const checked = await checkItems(householdId, petId, items);
    if ("error" in checked) return reply.code(404).send({ error: t(checked.error, request.locale) });

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
        items: { create: itemRows(householdId, items, checked.medicationTypeIds, checked.mealTypeIds) },
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
      select: { id: true, petId: true, items: { select: { medicationCourseId: true } } },
    });
    if (!existing) return reply.code(404).send({ error: t("routineNotFound", request.locale) });

    let medicationTypeIds: Set<string> = new Set();
    let mealTypeIds: Set<string> = new Set();
    if (data.items) {
      const kept = new Set(
        existing.items.map((item) => item.medicationCourseId).filter((id): id is string => !!id),
      );
      const checked = await checkItems(householdId, existing.petId, data.items, kept);
      if ("error" in checked) {
        return reply.code(404).send({ error: t(checked.error, request.locale) });
      }
      medicationTypeIds = checked.medicationTypeIds;
      mealTypeIds = checked.mealTypeIds;
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
          data: itemRows(householdId, data.items, medicationTypeIds, mealTypeIds).map((row) => ({
            ...row,
            routineId: id,
          })),
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
