import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createEvent, CreateEventDoseConflictError } from "./createEvent.js";

type Row = Record<string, unknown>;

/** 처방 단위 락을 흉내 내는 인메모리 DB — 락이 없으면 조회와 insert 사이에 다른 호출이 끼어든다. */
function fakeDb(opts: { locking: boolean }) {
  const events: Row[] = [];
  const tails = new Map<string, Promise<void>>();
  const tick = () => new Promise((r) => setTimeout(r, 1));

  const makeTx = (release: Array<() => void>) => ({
    $executeRaw: async (_s: TemplateStringsArray, key: string) => {
      if (!opts.locking) return 0;
      const prev = tails.get(key) ?? Promise.resolve();
      let done!: () => void;
      tails.set(key, new Promise<void>((r) => (done = r)));
      release.push(done);
      await prev;
      return 0;
    },
    pet: { findFirst: async () => ({ id: "pet1" }) },
    eventType: {
      findFirst: async () => ({ id: "t", key: "medication", scaleType: null }),
    },
    medicationCourse: {
      findFirst: async () => ({ id: "c1", dosesPerDay: 2, doseTimes: ["08:00", "19:00"] }),
    },
    product: { findFirst: async () => null },
    event: {
      findFirst: async () => null,
      findMany: async () => {
        const snapshot = events.map((e) => ({ doseSlotIndex: e.doseSlotIndex }));
        await tick();
        return snapshot;
      },
      aggregate: async () => {
        const ords = events.map((e) => e.doseOrdinal as number);
        return { _max: { doseOrdinal: ords.length ? Math.max(...ords) : null }, _count: { _all: events.length } };
      },
      create: async ({ data }: { data: Row }) => {
        await tick();
        events.push(data);
        return { id: `e${events.length}`, ...data };
      },
    },
  });

  const db = {
    ...makeTx([]),
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const release: Array<() => void> = [];
      try {
        return await fn(makeTx(release));
      } finally {
        release.forEach((r) => r());
      }
    },
  };
  return { db: db as unknown as PrismaClient, events };
}

const params = {
  householdId: "h1",
  petId: "pet1",
  eventTypeId: "t",
  medicationCourseId: "c1",
  doseSlotIndex: 0,
  source: "WEB" as const,
};

describe("createEvent 복약 슬롯 동시성", () => {
  it("같은 슬롯을 동시에 기록하면 한 건만 들어가고 나머지는 DOSE_SLOT_TAKEN", async () => {
    const { db, events } = fakeDb({ locking: true });
    const results = await Promise.allSettled([createEvent(db, params), createEvent(db, params)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(CreateEventDoseConflictError);
    expect(rejected.reason.message).toBe("DOSE_SLOT_TAKEN");
    expect(events).toHaveLength(1);
  });

  it("슬롯을 고르지 않은 동시 호출은 서로 다른 슬롯과 회차를 받는다", async () => {
    const { db, events } = fakeDb({ locking: true });
    const p = { ...params, doseSlotIndex: null };
    await Promise.all([createEvent(db, p), createEvent(db, p)]);
    expect(events.map((e) => e.doseSlotIndex).sort()).toEqual([0, 1]);
    expect(events.map((e) => e.doseOrdinal).sort()).toEqual([1, 2]);
  });

  it("락이 없으면 같은 슬롯이 두 번 기록된다 (테스트가 경합을 실제로 재현하는지 확인)", async () => {
    const { db, events } = fakeDb({ locking: false });
    await Promise.allSettled([createEvent(db, params), createEvent(db, params)]);
    expect(events).toHaveLength(2);
  });
});
