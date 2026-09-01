import type { FastifyInstance } from "fastify";
import {
  createMedicationCourseSchema,
  logMedicationDoseSchema,
  normalizeDoseTimes,
  updateMedicationCourseSchema,
} from "@kibble/shared";
import { prisma } from "../lib/prisma.js";
import { t } from "../lib/i18n.js";
import {
  householdWhere,
  requireHouseholdId,
  requireHouseholdWrite,
} from "../lib/householdScope.js";
import { assertPetInHousehold } from "../lib/historyPeriods.js";
import {
  listMedicationCourses,
  medicationCoursesWithProgress,
  resolveMedicationDoseLog,
  serializeCourse,
} from "../lib/medicationCourseProgress.js";
import { startOfTodayBoundary } from "../lib/kstClock.js";
import { sessionUserId } from "../lib/authenticate.js";
import {
  createEvent,
  CreateEventNotFoundError,
  CreateEventValidationError,
} from "../services/createEvent.js";

async function resolveActivePet(householdId: string, requestedPetId?: string) {
  const pets = await prisma.pet.findMany({
    where: { ...householdWhere(householdId), archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, species: true, sortOrder: true },
  });

  let activePet = pets[0] ?? null;
  if (requestedPetId) {
    const match = pets.find((p) => p.id === requestedPetId);
    if (!match) return { pets, activePet: null, notFound: true as const };
    activePet = match;
  }

  return { pets, activePet, notFound: false as const };
}

async function findMedicationEventTypeId(householdId: string): Promise<string | null> {
  const row = await prisma.eventType.findFirst({
    where: {
      key: "medication",
      archivedAt: null,
      OR: [{ householdId: null }, { householdId }],
    },
    select: { id: true },
  });
  return row?.id ?? null;
}

async function findCourseInHousehold(householdId: string, id: string) {
  return prisma.medicationCourse.findFirst({
    where: { id, ...householdWhere(householdId) },
  });
}

export async function careRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdId(request, reply);
    if (!householdId) return;

    const query = request.query as { petId?: string };
    const { pets, activePet, notFound } = await resolveActivePet(householdId, query.petId?.trim());
    if (notFound) {
      return reply.code(404).send({ error: t("petNotFound", request.locale) });
    }

    if (!activePet) {
      return { pets, activePet: null, medicationCourses: [], reminders: [] };
    }

    const [medicationCourses, reminders] = await Promise.all([
      medicationCoursesWithProgress(prisma, householdId, activePet.id),
      prisma.reminder.findMany({
        where: { petId: activePet.id, active: true },
        orderBy: { nextDueAt: "asc" },
        select: {
          id: true,
          label: true,
          nextDueAt: true,
          ruleType: true,
          eventType: { select: { key: true, label: true } },
        },
      }),
    ]);

    const now = Date.now();
    return {
      pets,
      activePet,
      medicationCourses,
      reminders: reminders.map((row) => ({
        id: row.id,
        label: row.label,
        nextDueAt: row.nextDueAt.toISOString(),
        ruleType: row.ruleType,
        eventTypeKey: row.eventType.key,
        eventTypeLabel: row.eventType.label,
        overdue: row.nextDueAt.getTime() < now,
      })),
    };
  });

  app.get("/medication-courses", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdId(request, reply);
    if (!householdId) return;

    const query = request.query as { petId?: string; includeArchived?: string };
    const petId = query.petId?.trim();
    if (!petId) {
      return reply.code(400).send({ error: t("petIdRequired", request.locale) });
    }
    const petOk = await assertPetInHousehold(prisma, householdId, petId);
    if (!petOk) return reply.code(404).send({ error: t("petNotFound", request.locale) });

    const includeArchived = query.includeArchived === "1";
    const courses = await listMedicationCourses(prisma, householdId, petId, includeArchived);
    return { courses };
  });

  app.post(
    "/medication-courses",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const householdId = requireHouseholdWrite(request, reply);
      if (!householdId) return;

      const parsed = createMedicationCourseSchema.safeParse(request.body ?? {});
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

      const body = parsed.data;
      const petOk = await assertPetInHousehold(prisma, householdId, body.petId);
      if (!petOk) return reply.code(404).send({ error: t("petNotFound", request.locale) });

      const dosesPerDay = body.dosesPerDay ?? 1;
      const doseTimes = normalizeDoseTimes(body.doseTimes ?? body.doseSlotKeys, dosesPerDay);

      const course = await prisma.medicationCourse.create({
        data: {
          householdId,
          petId: body.petId,
          name: body.name,
          dosesPerDay,
          doseTimes,
          totalDoses: body.totalDoses ?? undefined,
          startDate: body.startDate ? new Date(body.startDate) : new Date(),
          endDate: body.endDate ? new Date(body.endDate) : undefined,
          note: body.note ?? undefined,
        },
      });

      return reply.code(201).send(serializeCourse(course));
    },
  );

  app.patch(
    "/medication-courses/:id",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const householdId = requireHouseholdWrite(request, reply);
      if (!householdId) return;

      const { id } = request.params as { id: string };
      const existing = await findCourseInHousehold(householdId, id);
      if (!existing) {
        return reply.code(404).send({ error: t("medicationCourseNotFound", request.locale) });
      }

      const parsed = updateMedicationCourseSchema.safeParse(request.body ?? {});
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

      const body = parsed.data;
      const dosesPerDay = body.dosesPerDay ?? existing.dosesPerDay;
      const doseTimes =
        body.doseTimes !== undefined ||
        body.doseSlotKeys !== undefined ||
        body.dosesPerDay !== undefined
          ? normalizeDoseTimes(
              body.doseTimes ?? body.doseSlotKeys ?? existing.doseTimes,
              dosesPerDay,
            )
          : undefined;

      const course = await prisma.medicationCourse.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.dosesPerDay !== undefined ? { dosesPerDay: body.dosesPerDay } : {}),
          ...(doseTimes !== undefined ? { doseTimes } : {}),
          ...(body.totalDoses !== undefined ? { totalDoses: body.totalDoses } : {}),
          ...(body.startDate !== undefined ? { startDate: new Date(body.startDate) } : {}),
          ...(body.endDate !== undefined
            ? { endDate: body.endDate ? new Date(body.endDate) : null }
            : {}),
          ...(body.note !== undefined ? { note: body.note } : {}),
        },
      });

      return serializeCourse(course);
    },
  );

  app.delete(
    "/medication-courses/:id",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const householdId = requireHouseholdWrite(request, reply);
      if (!householdId) return;

      const { id } = request.params as { id: string };
      const existing = await findCourseInHousehold(householdId, id);
      if (!existing) {
        return reply.code(404).send({ error: t("medicationCourseNotFound", request.locale) });
      }

      await prisma.medicationCourse.update({
        where: { id },
        data: { archivedAt: new Date() },
      });

      return { ok: true };
    },
  );

  app.post(
    "/medication-courses/:id/doses",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const householdId = requireHouseholdWrite(request, reply);
      if (!householdId) return;

      const { id } = request.params as { id: string };
      const parsed = logMedicationDoseSchema.safeParse(request.body ?? {});
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

      const course = await prisma.medicationCourse.findFirst({
        where: { id, ...householdWhere(householdId), archivedAt: null },
        select: { id: true, petId: true, dosesPerDay: true, doseTimes: true },
      });
      if (!course) {
        return reply.code(404).send({ error: t("medicationCourseNotFound", request.locale) });
      }

      const since = startOfTodayBoundary();
      const todayEvents = await prisma.event.findMany({
        where: {
          ...householdWhere(householdId),
          petId: course.petId,
          medicationCourseId: course.id,
          deletedAt: null,
          occurredAt: { gte: since },
        },
        select: { doseSlotIndex: true },
      });

      const resolved = resolveMedicationDoseLog(
        course,
        todayEvents,
        parsed.data.doseSlotIndex,
      );
      if ("error" in resolved) {
        if (resolved.error === "limit") {
          return reply.code(400).send({ error: t("medicationDoseLimitReached", request.locale) });
        }
        if (resolved.error === "slotTaken") {
          return reply.code(400).send({ error: t("medicationDoseSlotTaken", request.locale) });
        }
        return reply.code(400).send({ error: t("medicationDoseSlotInvalid", request.locale) });
      }

      const medicationTypeId = await findMedicationEventTypeId(householdId);
      if (!medicationTypeId) {
        return reply.code(500).send({ error: t("systemEventTypesNotSeeded", request.locale) });
      }

      try {
        const event = await createEvent(prisma, {
          householdId,
          petId: course.petId,
          eventTypeId: medicationTypeId,
          medicationCourseId: course.id,
          doseSlotIndex: resolved.doseSlotIndex,
          occurredAt: resolved.occurredAt,
          source: "WEB",
          createdById: sessionUserId(request),
        });
        return reply.code(201).send({ eventId: event.id });
      } catch (err) {
        if (err instanceof CreateEventNotFoundError || err instanceof CreateEventValidationError) {
          return reply.code(400).send({ error: t("eventTargetRequired", request.locale) });
        }
        throw err;
      }
    },
  );

  app.delete(
    "/medication-courses/:id/doses/latest",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const householdId = requireHouseholdWrite(request, reply);
      if (!householdId) return;

      const { id } = request.params as { id: string };
      const course = await findCourseInHousehold(householdId, id);
      if (!course) {
        return reply.code(404).send({ error: t("medicationCourseNotFound", request.locale) });
      }

      const since = startOfTodayBoundary();
      const event = await prisma.event.findFirst({
        where: {
          ...householdWhere(householdId),
          petId: course.petId,
          medicationCourseId: course.id,
          deletedAt: null,
          occurredAt: { gte: since },
        },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        select: { id: true },
      });
      if (!event) {
        return reply.code(404).send({ error: t("medicationDoseNotFound", request.locale) });
      }

      await prisma.event.update({
        where: { id: event.id },
        data: { deletedAt: new Date() },
      });

      return { ok: true, eventId: event.id };
    },
  );
}
