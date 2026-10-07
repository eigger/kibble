import { describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  createEvent,
  CreateEventDedupeDeletedError,
  CreateEventNotFoundError,
  CreateEventScopeError,
  CreateEventValidationError,
} from "./createEvent.js";
import { mapCreateEventError } from "../lib/createEventErrors.js";

type FakeOpts = {
  existing?: Record<string, unknown>; presetTypeId?: string; typeKey?: string; course?: boolean };

function fakeDb(opts: FakeOpts = {}) {
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "e1", ...data }));
  const db = {
    $executeRaw: vi.fn(async () => 0),
    preset: {
      findFirst: vi.fn(async () =>
        opts.presetTypeId
          ? { id: "p1", eventTypeId: opts.presetTypeId, quantity: null, unit: null, petId: null }
          : null,
      ),
    },
    pet: { findFirst: vi.fn(async () => ({ id: "pet1" })) },
    eventType: {
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        key: opts.typeKey ?? "meal",
        scaleType: null,
      })),
    },
    medicationCourse: {
      findFirst: vi.fn(async () =>
        opts.course ? { id: "c1", dosesPerDay: 1, doseTimes: [] } : null,
      ),
    },
    event: {
      findFirst: vi.fn(async () => opts.existing ?? null),
      update: vi.fn(async ({ data }: { data: object }) => ({ ...opts.existing, ...data })),
      findMany: vi.fn(async () => []),
      aggregate: vi.fn(async () => ({ _max: { doseOrdinal: null }, _count: { _all: 0 } })),
      create,
    },
    product: { findFirst: vi.fn(async () => null) },
  };
  return { db: db as unknown as PrismaClient, create, update: db.event.update };
}

const base = { householdId: "h1", petId: "pet1", source: "API" as const };

describe("createEvent token scope", () => {
  it("rejects a preset whose type differs from the scoped event type", async () => {
    const { db, create } = fakeDb({ presetTypeId: "type-b" });
    await expect(
      createEvent(db, { ...base, presetId: "p1", scopedEventTypeId: "type-a" }),
    ).rejects.toBeInstanceOf(CreateEventScopeError);
    expect(create).not.toHaveBeenCalled();
  });

  it("allows a preset whose type matches the scope", async () => {
    const { db, create } = fakeDb({ presetTypeId: "type-a" });
    await createEvent(db, { ...base, presetId: "p1", scopedEventTypeId: "type-a" });
    expect(create).toHaveBeenCalledOnce();
  });
});

describe("createEvent dedupe scope", () => {
  const existing = { id: "e0", petId: "pet1", eventTypeId: "type-b", deletedAt: new Date() };

  it("neither returns nor restores an out-of-scope event type", async () => {
    const { db, update } = fakeDb({ existing });
    await expect(
      createEvent(db, { ...base, eventTypeId: "type-a", scopedEventTypeId: "type-a", dedupeKey: "k" }),
    ).rejects.toBeInstanceOf(CreateEventScopeError);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an out-of-scope pet", async () => {
    const { db, update } = fakeDb({ existing });
    await expect(
      createEvent(db, { ...base, eventTypeId: "type-b", scopedPetId: "pet2", dedupeKey: "k" }),
    ).rejects.toBeInstanceOf(CreateEventScopeError);
    expect(update).not.toHaveBeenCalled();
  });

  it("does not resurrect an in-scope soft-deleted event", async () => {
    const { db, update, create } = fakeDb({ existing });
    await expect(
      createEvent(db, {
        ...base,
        eventTypeId: "type-b",
        scopedEventTypeId: "type-b",
        scopedPetId: "pet1",
        dedupeKey: "k",
      }),
    ).rejects.toBeInstanceOf(CreateEventDedupeDeletedError);
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a deleted event found by the post-conflict lookup too", async () => {
    // 선조회는 비었고(경합), insert가 unique 오류를 낸 뒤 재조회가 삭제된 행을 찾는다
    const { db, create } = fakeDb({});
    let calls = 0;
    (db.event.findFirst as unknown as ReturnType<typeof vi.fn>) = vi.fn(async () =>
      calls++ === 0 ? null : existing,
    );
    create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "test" }),
    );
    await expect(
      createEvent(db, { ...base, eventTypeId: "type-b", dedupeKey: "k" }),
    ).rejects.toBeInstanceOf(CreateEventDedupeDeletedError);
  });

  it("returns a live in-scope event for the same key (idempotent retry)", async () => {
    const { db, update, create } = fakeDb({ existing: { ...existing, deletedAt: null } });
    const out = await createEvent(db, { ...base, eventTypeId: "type-b", dedupeKey: "k" });
    expect(out.id).toBe("e0");
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});

describe("createEvent medication course", () => {
  it("rejects a course on a non-medication event", async () => {
    const { db } = fakeDb({ typeKey: "meal", course: true });
    await expect(
      createEvent(db, { ...base, eventTypeId: "t", medicationCourseId: "c1" }),
    ).rejects.toMatchObject({ message: "MEDICATION_COURSE_NOT_ALLOWED" });
  });

  it("reports a missing course as a course error, not an event type error", async () => {
    const { db } = fakeDb({ typeKey: "medication", course: false });
    await expect(
      createEvent(db, { ...base, eventTypeId: "t", medicationCourseId: "c1" }),
    ).rejects.toMatchObject({ field: "course" });
  });
});

describe("mapCreateEventError", () => {
  it("maps each error to a dedicated key and status", () => {
    expect(mapCreateEventError(new CreateEventScopeError())).toEqual({ status: 403, key: "forbidden" });
    expect(mapCreateEventError(new CreateEventNotFoundError("course"))).toEqual({
      status: 404,
      key: "medicationCourseNotFound",
    });
    const v = (m: string) => mapCreateEventError(new CreateEventValidationError(m));
    expect(v("PRESET_PET_MISMATCH")?.key).toBe("presetPetMismatch");
    expect(v("DOSE_SLOT_INVALID")?.key).toBe("medicationDoseSlotInvalid");
    expect(v("DOSE_SLOT_WITHOUT_COURSE")?.key).toBe("doseSlotWithoutCourse");
    expect(v("MEDICATION_COURSE_NOT_ALLOWED")).toEqual({ status: 400, key: "medicationCourseNotAllowed" });
    expect(v("EVENT_TYPE_REQUIRED")?.key).toBe("eventTargetRequired");
    expect(mapCreateEventError(new CreateEventDedupeDeletedError())).toEqual({
      status: 409,
      key: "eventDedupeDeleted",
    });
  });
});
