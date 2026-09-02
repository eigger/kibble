import type { EventSource, Prisma, PrismaClient, ScaleType } from "@prisma/client";
import {
  normalizeDoseTimes,
  resolveDoseTimeOccurredAt,
} from "@kibble/shared";
import { householdWhere } from "../lib/householdScope.js";
import { startOfTodayBoundary } from "../lib/kstClock.js";
import { isUniqueConstraintError } from "../lib/prismaErrors.js";

export class CreateEventNotFoundError extends Error {
  readonly field: "pet" | "preset" | "eventType";

  constructor(field: "pet" | "preset" | "eventType") {
    super(`CREATE_EVENT_NOT_FOUND_${field.toUpperCase()}`);
    this.name = "CreateEventNotFoundError";
    this.field = field;
  }
}

export class CreateEventValidationError extends Error {
  constructor(message = "CREATE_EVENT_VALIDATION") {
    super(message);
    this.name = "CreateEventValidationError";
  }
}

export type CreateEventParams = {
  householdId: string;
  petId: string;
  presetId?: string | null;
  eventTypeId?: string;
  occurredAt?: Date;
  quantity?: number | null;
  quantityOffered?: number | null;
  unit?: string | null;
  scaleValue?: number | null;
  productName?: string | null;
  contactId?: string | null;
  note?: string | null;
  rawText?: string | null;
  entryId?: string | null;
  needsReview?: boolean;
  source: EventSource;
  createdById?: string | null;
  dedupeKey?: string | null;
  medicationCourseId?: string | null;
  doseSlotIndex?: number | null;
};

type Db = PrismaClient | Prisma.TransactionClient;

const eventSelect = {
  id: true,
  householdId: true,
  petId: true,
  eventTypeId: true,
  presetId: true,
  occurredAt: true,
  quantity: true,
  quantityOffered: true,
  unit: true,
  scaleValue: true,
  productName: true,
  contactId: true,
  note: true,
  rawText: true,
  entryId: true,
  needsReview: true,
  source: true,
  dedupeKey: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

export type CreatedEvent = Prisma.EventGetPayload<{ select: typeof eventSelect }>;

export function validateScaleValue(
  scaleType: ScaleType | null,
  scaleValue: number | null | undefined,
): void {
  if (scaleValue == null) return;
  if (!Number.isInteger(scaleValue)) {
    throw new CreateEventValidationError("SCALE_VALUE_INVALID");
  }
  const range =
    scaleType === "FECAL_7"
      ? { min: 1, max: 7 }
      : scaleType === "APPETITE_3" || scaleType === "ENERGY_3" || scaleType === "URINE_AMOUNT_3"
        ? { min: 1, max: 3 }
        : null;
  if (!range) {
    throw new CreateEventValidationError("SCALE_VALUE_NOT_ALLOWED");
  }
  if (scaleValue < range.min || scaleValue > range.max) {
    throw new CreateEventValidationError("SCALE_VALUE_OUT_OF_RANGE");
  }
}

async function findByDedupeKey(
  db: Db,
  householdId: string,
  dedupeKey: string,
): Promise<CreatedEvent | null> {
  return db.event.findFirst({
    where: {
      ...householdWhere(householdId),
      dedupeKey,
    },
    select: eventSelect,
  });
}

async function restoreOrReturnDedupe(
  db: Db,
  existing: CreatedEvent,
): Promise<CreatedEvent> {
  if (!existing.deletedAt) return existing;
  return db.event.update({
    where: { id: existing.id },
    data: { deletedAt: null },
    select: eventSelect,
  });
}

/** K-4: 이벤트 생성은 이 함수만 통과한다. */
export async function createEvent(db: Db, params: CreateEventParams): Promise<CreatedEvent> {
  if (params.dedupeKey) {
    const existing = await findByDedupeKey(db, params.householdId, params.dedupeKey);
    if (existing) return restoreOrReturnDedupe(db, existing);
  }

  let eventTypeId = params.eventTypeId;
  let presetId = params.presetId ?? null;
  let quantity = params.quantity ?? null;
  const quantityOffered = params.quantityOffered ?? null;
  let unit = params.unit ?? null;

  if (presetId) {
    const preset = await db.preset.findFirst({
      where: {
        id: presetId,
        ...householdWhere(params.householdId),
        archivedAt: null,
      },
      select: {
        id: true,
        eventTypeId: true,
        quantity: true,
        unit: true,
        petId: true,
      },
    });
    if (!preset) throw new CreateEventNotFoundError("preset");

    eventTypeId = preset.eventTypeId;
    presetId = preset.id;
    if (quantity == null && preset.quantity != null) quantity = Number(preset.quantity);
    if (unit == null && preset.unit) unit = preset.unit;

    if (preset.petId && preset.petId !== params.petId) {
      throw new CreateEventValidationError("PRESET_PET_MISMATCH");
    }
  }

  if (!eventTypeId) throw new CreateEventValidationError("EVENT_TYPE_REQUIRED");

  const pet = await db.pet.findFirst({
    where: {
      id: params.petId,
      ...householdWhere(params.householdId),
      archivedAt: null,
    },
    select: { id: true },
  });
  if (!pet) throw new CreateEventNotFoundError("pet");

  const eventType = await db.eventType.findFirst({
    where: {
      id: eventTypeId,
      OR: [{ householdId: null }, { householdId: params.householdId }],
      archivedAt: null,
    },
    select: { id: true, scaleType: true },
  });
  if (!eventType) throw new CreateEventNotFoundError("eventType");

  validateScaleValue(eventType.scaleType, params.scaleValue);

  const medicationCourseId: string | null = params.medicationCourseId ?? null;
  let doseSlotIndex: number | null = params.doseSlotIndex ?? null;
  let occurredAt = params.occurredAt ?? new Date();

  if (medicationCourseId) {
    const course = await db.medicationCourse.findFirst({
      where: {
        id: medicationCourseId,
        ...householdWhere(params.householdId),
        petId: params.petId,
        archivedAt: null,
      },
      select: { id: true, dosesPerDay: true, doseTimes: true },
    });
    if (!course) throw new CreateEventNotFoundError("eventType");

    if (course.doseTimes.length > 0) {
      const doseTimes = normalizeDoseTimes(course.doseTimes, course.dosesPerDay);
      if (doseSlotIndex == null) {
        throw new CreateEventValidationError("DOSE_SLOT_REQUIRED");
      }
      if (doseSlotIndex < 0 || doseSlotIndex >= doseTimes.length) {
        throw new CreateEventValidationError("DOSE_SLOT_INVALID");
      }

      const since = startOfTodayBoundary(occurredAt);
      const existing = await db.event.findFirst({
        where: {
          ...householdWhere(params.householdId),
          petId: params.petId,
          medicationCourseId: course.id,
          doseSlotIndex,
          deletedAt: null,
          occurredAt: { gte: since },
        },
        select: { id: true },
      });
      if (existing) throw new CreateEventValidationError("DOSE_SLOT_TAKEN");

      if (!params.occurredAt) {
        occurredAt = resolveDoseTimeOccurredAt(doseTimes[doseSlotIndex], occurredAt);
      }
    } else {
      doseSlotIndex = null;
    }
  } else if (doseSlotIndex != null) {
    throw new CreateEventValidationError("DOSE_SLOT_WITHOUT_COURSE");
  }

  try {
    return await db.event.create({
      data: {
        householdId: params.householdId,
        petId: params.petId,
        eventTypeId,
        presetId,
        occurredAt,
        quantity: quantity ?? undefined,
        quantityOffered: quantityOffered ?? undefined,
        unit: unit ?? undefined,
        scaleValue: params.scaleValue ?? undefined,
        productName: params.productName?.trim() || undefined,
        contactId: params.contactId ?? undefined,
        note: params.note ?? undefined,
        rawText: params.rawText ?? undefined,
        entryId: params.entryId ?? undefined,
        needsReview: params.needsReview ?? false,
        source: params.source,
        createdById: params.createdById ?? undefined,
        dedupeKey: params.dedupeKey ?? undefined,
        medicationCourseId: medicationCourseId ?? undefined,
        doseSlotIndex: doseSlotIndex ?? undefined,
      },
      select: eventSelect,
    });
  } catch (err) {
    if (params.dedupeKey && isUniqueConstraintError(err)) {
      const raced = await findByDedupeKey(db, params.householdId, params.dedupeKey);
      if (raced) return restoreOrReturnDedupe(db, raced);
    }
    throw err;
  }
}

export { eventSelect };

export const eventWithRelationsSelect = {
  ...eventSelect,
  eventType: { select: { key: true, label: true, icon: true, scaleType: true, category: true } },
  preset: { select: { id: true, label: true } },
  contact: {
    select: { id: true, name: true, address: true, latitude: true, longitude: true, placeUrl: true },
  },
  course: { select: { id: true, name: true } },
  attachments: {
    select: { id: true, path: true, mime: true, size: true, width: true, height: true },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

export type CreatedEventWithRelations = Prisma.EventGetPayload<{
  select: typeof eventWithRelationsSelect;
}>;
