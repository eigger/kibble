import type { EventSource, Prisma, PrismaClient, ScaleType } from "@prisma/client";
import { normalizeDoseTimes, pickDoseSlot } from "@kibble/shared";
import { resolveEventProductFields } from "../lib/eventProduct.js";
import { productNameIsTagList } from "../lib/frequentProducts.js";
import { householdWhere } from "../lib/householdScope.js";
import { nextDoseOrdinal } from "../lib/medicationCourseProgress.js";
import { startOfTodayBoundary } from "../lib/kstClock.js";
import { isUniqueConstraintError } from "../lib/prismaErrors.js";

export class CreateEventNotFoundError extends Error {
  readonly field: "pet" | "preset" | "eventType" | "course";

  constructor(field: "pet" | "preset" | "eventType" | "course") {
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

/** 토큰 스코프(고정 eventTypeId)를 벗어나는 요청 — 라우트는 403으로 돌려준다. */
export class CreateEventScopeError extends Error {
  constructor() {
    super("EVENT_TYPE_SCOPE_MISMATCH");
    this.name = "CreateEventScopeError";
  }
}

/**
 * 같은 `dedupeKey`의 기록이 이미 있지만 삭제됐다. 되살리지 않는다 — 응답이 유실돼 큐에 남은
 * 요청이 늦게 도착했을 때, 그 사이 사용자가 일부러 지운 기록이 다시 나타나면 안 된다.
 * 라우트는 409로 돌려주고 오프라인 큐는 영구 거부로 알린다 (WORKLOG 2026-10-07).
 */
export class CreateEventDedupeDeletedError extends Error {
  constructor() {
    super("DEDUPE_KEY_DELETED");
    this.name = "CreateEventDedupeDeletedError";
  }
}

/**
 * 그날 몫의 복약이 이미 기록됐다 — 슬롯이 찼거나, 슬롯 없는 처방이 하루 횟수에 닿았다.
 * 라우트는 409로 돌려주고 루틴은 그 항목을 건너뜀으로 센다 (WORKPLAN §7.24).
 */
export class CreateEventDoseConflictError extends Error {
  constructor(message: "DOSE_SLOT_TAKEN" | "DOSE_LIMIT_REACHED") {
    super(message);
    this.name = "CreateEventDoseConflictError";
  }
}

export type CreateEventParams = {
  householdId: string;
  petId: string;
  presetId?: string | null;
  eventTypeId?: string;
  /** 토큰 등으로 고정된 이벤트 타입 — 프리셋 해석 결과가 다르면 CreateEventScopeError. */
  scopedEventTypeId?: string | null;
  /** 토큰 등으로 고정된 반려동물 — dedupe로 찾은 기존 기록이 다른 pet이면 CreateEventScopeError. */
  scopedPetId?: string | null;
  occurredAt?: Date;
  quantity?: number | null;
  quantityOffered?: number | null;
  unit?: string | null;
  scaleValue?: number | null;
  productId?: string | null;
  productName?: string | null;
  contactId?: string | null;
  costKrw?: number | null;
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
  productId: true,
  occurredAt: true,
  quantity: true,
  quantityOffered: true,
  unit: true,
  scaleValue: true,
  productName: true,
  contactId: true,
  doseSlotIndex: true,
  doseOrdinal: true,
  costKrw: true,
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

/** 삭제된 기록은 복원하지 않고 거절한다. 살아 있는 기록만 그대로 돌려준다(멱등). */
function returnLiveDedupe(existing: CreatedEvent): CreatedEvent {
  if (existing.deletedAt) throw new CreateEventDedupeDeletedError();
  return existing;
}

/** 스코프 밖 기록은 dedupe로도 반환·복원하지 않는다. */
function assertDedupeInScope(existing: CreatedEvent, params: CreateEventParams): void {
  if (
    (params.scopedEventTypeId && existing.eventTypeId !== params.scopedEventTypeId) ||
    (params.scopedPetId && existing.petId !== params.scopedPetId)
  ) {
    throw new CreateEventScopeError();
  }
}

/**
 * K-4: 이벤트 생성은 이 함수만 통과한다.
 *
 * 복약(처방 연결) 기록은 "그날 슬롯 조회 → 판정 → insert"라 동시에 들어오면 같은
 * 슬롯이 두 번 찍히고 doseOrdinal이 겹친다. 처방 단위 advisory lock으로 직렬화한다
 * (WORKPLAN §7.24, WORKLOG 2026-10-07). 락은 트랜잭션이 끝날 때 풀린다.
 */
export async function createEvent(db: Db, params: CreateEventParams): Promise<CreatedEvent> {
  if (!params.medicationCourseId) return createEventUnlocked(db, params);

  const run = async (tx: Prisma.TransactionClient) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`kibble:medication-course:${params.medicationCourseId}`}, 0))`;
    return createEventUnlocked(tx, params);
  };
  // `in` 대신 typeof — 운영의 전역 prisma는 has 트랩 없는 Proxy라 `in`이 false가 된다.
  // Prisma 7.10에서는 트랜잭션 클라이언트에도 런타임에 $transaction이 있어(타입에서만
  // 빠져 있다) 이미 트랜잭션 안에서 불러도 이 분기를 탄다 — 중첩은 SAVEPOINT가 되고
  // 락은 바깥 트랜잭션이 끝날 때 풀린다. 아래 마지막 return은 $transaction이 없는
  // 클라이언트(단위 테스트의 fake 등)를 위한 방어 분기이며, 실제 Prisma 클라이언트로는
  // 도달하지 않지만 타입 안전한 폴백이라 남긴다.
  const root = db as PrismaClient;
  if (typeof root.$transaction === "function") {
    // 락을 얻은 뒤 실행하는 쿼리가 새 스냅숏을 봐야 하므로 READ COMMITTED를 명시한다.
    return root.$transaction(run, { isolationLevel: "ReadCommitted" });
  }
  return run(db as Prisma.TransactionClient);
}

async function createEventUnlocked(db: Db, params: CreateEventParams): Promise<CreatedEvent> {
  if (params.dedupeKey) {
    const existing = await findByDedupeKey(db, params.householdId, params.dedupeKey);
    if (existing) {
      assertDedupeInScope(existing, params);
      return returnLiveDedupe(existing);
    }
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

    if (params.scopedEventTypeId && preset.eventTypeId !== params.scopedEventTypeId) {
      throw new CreateEventScopeError();
    }

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
    select: { id: true, key: true, scaleType: true },
  });
  if (!eventType) throw new CreateEventNotFoundError("eventType");
  if (params.scopedEventTypeId && eventType.id !== params.scopedEventTypeId) {
    throw new CreateEventScopeError();
  }

  validateScaleValue(eventType.scaleType, params.scaleValue);

  const medicationCourseId: string | null = params.medicationCourseId ?? null;
  let doseSlotIndex: number | null = params.doseSlotIndex ?? null;
  let doseOrdinal: number | null = null;
  const occurredAt = params.occurredAt ?? new Date();

  if (medicationCourseId) {
    if (eventType.key !== "medication") {
      throw new CreateEventValidationError("MEDICATION_COURSE_NOT_ALLOWED");
    }
    const course = await db.medicationCourse.findFirst({
      where: {
        id: medicationCourseId,
        ...householdWhere(params.householdId),
        petId: params.petId,
        archivedAt: null,
      },
      select: { id: true, dosesPerDay: true, doseTimes: true },
    });
    if (!course) throw new CreateEventNotFoundError("course");

    // 복약 시각은 입력한 시각이다. 처방의 doseTimes는 "언제 먹여야 하나"이지 "그때
    // 먹였다"가 아니다 — 슬롯은 doseSlotIndex로만 매인다 (WORKPLAN §3.10, R165).
    const dayStart = startOfTodayBoundary(occurredAt);
    const sameDayDoses = await db.event.findMany({
      where: {
        ...householdWhere(params.householdId),
        petId: params.petId,
        medicationCourseId: course.id,
        deletedAt: null,
        occurredAt: { gte: dayStart, lt: new Date(dayStart.getTime() + 86_400_000) },
      },
      select: { doseSlotIndex: true },
    });

    if (course.doseTimes.length > 0) {
      const doseTimes = normalizeDoseTimes(course.doseTimes, course.dosesPerDay);
      const filled = sameDayDoses
        .map((e) => e.doseSlotIndex)
        .filter((index): index is number => index != null);
      if (doseSlotIndex == null) {
        // 슬롯을 고르지 않은 복약(루틴 등) — 비어 있는 슬롯 중 기록 시각에 가장 가까운 것
        doseSlotIndex = pickDoseSlot(doseTimes, filled, occurredAt);
        if (doseSlotIndex == null) throw new CreateEventDoseConflictError("DOSE_LIMIT_REACHED");
      } else {
        if (doseSlotIndex < 0 || doseSlotIndex >= doseTimes.length) {
          throw new CreateEventValidationError("DOSE_SLOT_INVALID");
        }
        if (filled.includes(doseSlotIndex)) {
          throw new CreateEventDoseConflictError("DOSE_SLOT_TAKEN");
        }
      }
    } else {
      doseSlotIndex = null;
      if (sameDayDoses.length >= course.dosesPerDay) {
        throw new CreateEventDoseConflictError("DOSE_LIMIT_REACHED");
      }
    }

    // 회차는 기록하는 순간 찍는다 — 이력은 "그때 몇 번째였나"를 남기는 자리이므로
    // 나중에 다시 세지 않는다. 진행 중인 처방의 현재 진행률은 케어 화면이 실제
    // 이벤트 수로 따로 유도한다 (medicationCourseProgress).
    const numbering = await db.event.aggregate({
      where: {
        ...householdWhere(params.householdId),
        medicationCourseId: course.id,
      },
      _max: { doseOrdinal: true },
      _count: { _all: true },
    });
    doseOrdinal = nextDoseOrdinal(numbering._max.doseOrdinal, numbering._count._all);
  } else if (doseSlotIndex != null) {
    throw new CreateEventValidationError("DOSE_SLOT_WITHOUT_COURSE");
  }

  const requestedProductId = params.productId?.trim() || null;
  const householdProduct = requestedProductId
    ? await db.product.findFirst({
        where: {
          id: requestedProductId,
          ...householdWhere(params.householdId),
        },
        select: { id: true, name: true },
      })
    : null;
  // PATCH와 같은 규칙 — 태그 타입(관리 등)은 productName이 slug 목록이라 제품 이름으로 채우지 않는다 (§7.20)
  const resolvedProduct = resolveEventProductFields({
    productId: requestedProductId,
    productName: params.productName?.trim() || undefined,
    householdProduct,
    fillNameFromProduct: !productNameIsTagList(eventType.key),
  });
  const productId = resolvedProduct.productId ?? null;
  const productName = resolvedProduct.productName ?? null;

  try {
    return await db.event.create({
      data: {
        householdId: params.householdId,
        petId: params.petId,
        eventTypeId,
        presetId,
        productId: productId ?? undefined,
        occurredAt,
        quantity: quantity ?? undefined,
        quantityOffered: quantityOffered ?? undefined,
        unit: unit ?? undefined,
        scaleValue: params.scaleValue ?? undefined,
        productName: productName || undefined,
        contactId: params.contactId ?? undefined,
        costKrw: params.costKrw ?? undefined,
        note: params.note ?? undefined,
        rawText: params.rawText ?? undefined,
        entryId: params.entryId ?? undefined,
        needsReview: params.needsReview ?? false,
        source: params.source,
        createdById: params.createdById ?? undefined,
        updatedById: params.createdById ?? undefined,
        dedupeKey: params.dedupeKey ?? undefined,
        medicationCourseId: medicationCourseId ?? undefined,
        doseSlotIndex: doseSlotIndex ?? undefined,
        doseOrdinal: doseOrdinal ?? undefined,
      },
      select: eventSelect,
    });
  } catch (err) {
    if (params.dedupeKey && isUniqueConstraintError(err)) {
      const raced = await findByDedupeKey(db, params.householdId, params.dedupeKey);
      if (raced) {
        assertDedupeInScope(raced, params);
        return returnLiveDedupe(raced);
      }
    }
    throw err;
  }
}

export { eventSelect };

export const eventWithRelationsSelect = {
  ...eventSelect,
  eventType: { select: { key: true, label: true, icon: true, scaleType: true, category: true } },
  preset: { select: { id: true, label: true } },
  product: {
    select: {
      id: true,
      name: true,
      brand: true,
      category: true,
      photoPath: true,
      dosage: true,
      isActive: true,
    },
  },
  contact: {
    select: { id: true, name: true, address: true, latitude: true, longitude: true, placeUrl: true },
  },
  course: {
    select: { id: true, name: true, totalDoses: true, dosage: true, dosesPerDay: true, doseTimes: true },
  },
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
  attachments: {
    select: { id: true, path: true, mime: true, size: true, width: true, height: true },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

export type CreatedEventWithRelations = Prisma.EventGetPayload<{
  select: typeof eventWithRelationsSelect;
}>;
