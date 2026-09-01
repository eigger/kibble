import type { EventSource, Prisma, PrismaClient } from "@prisma/client";
import { householdWhere } from "../lib/householdScope.js";
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
  note?: string | null;
  rawText?: string | null;
  entryId?: string | null;
  needsReview?: boolean;
  source: EventSource;
  createdById?: string | null;
  dedupeKey?: string | null;
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

/** K-4: 이벤트 생성은 이 함수만 통과한다. */
export async function createEvent(db: Db, params: CreateEventParams): Promise<CreatedEvent> {
  if (params.dedupeKey) {
    const existing = await db.event.findFirst({
      where: {
        ...householdWhere(params.householdId),
        dedupeKey: params.dedupeKey,
        deletedAt: null,
      },
      select: eventSelect,
    });
    if (existing) return existing;
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
    select: { id: true },
  });
  if (!eventType) throw new CreateEventNotFoundError("eventType");

  const occurredAt = params.occurredAt ?? new Date();

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
        note: params.note ?? undefined,
        rawText: params.rawText ?? undefined,
        entryId: params.entryId ?? undefined,
        needsReview: params.needsReview ?? false,
        source: params.source,
        createdById: params.createdById ?? undefined,
        dedupeKey: params.dedupeKey ?? undefined,
      },
      select: eventSelect,
    });
  } catch (err) {
    if (params.dedupeKey && isUniqueConstraintError(err)) {
      const raced = await db.event.findFirst({
        where: {
          ...householdWhere(params.householdId),
          dedupeKey: params.dedupeKey,
          deletedAt: null,
        },
        select: eventSelect,
      });
      if (raced) return raced;
    }
    throw err;
  }
}

export { eventSelect };
