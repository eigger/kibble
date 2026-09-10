import { describe, expect, it, vi } from "vitest";
import { mergeSystemEventType } from "./mergeSystemEventType.js";

const dentalId = "dental-id";
const careId = "care-id";

function mockPrisma(existing: Record<string, { id: string }>) {
  const eventType = {
    findFirst: vi.fn(async ({ where }: { where: { key?: string } }) =>
      where.key && existing[where.key] ? { id: existing[where.key].id, key: where.key } : null,
    ),
    update: vi.fn(async () => ({})),
  };

  const preset = {
    findMany: vi.fn(async () => [
      {
        id: "preset-dental",
        householdId: "hh",
        petId: "pet",
        eventTypeId: dentalId,
        label: "eventType.dental",
      },
      {
        id: "preset-dental-custom",
        householdId: "hh",
        petId: "pet-2",
        eventTypeId: dentalId,
        label: "저녁 양치",
      },
    ]),
    findFirst: vi.fn(async ({ where }: { where: { petId?: string } }) =>
      where.petId === "pet" ? { id: "preset-care" } : null,
    ),
    update: vi.fn(async () => ({})),
    updateMany: vi.fn(async () => ({ count: 1 })),
  };

  const event = {
    findMany: vi.fn(async () => [
      { id: "ev-tagged", productName: "치약 A" },
      { id: "ev-empty", productName: "" },
    ]),
    update: vi.fn(async () => ({})),
    updateMany: vi.fn(async () => ({ count: 2 })),
  };
  const reminder = { updateMany: vi.fn(async () => ({ count: 0 })) };
  const apiToken = { updateMany: vi.fn(async () => ({ count: 0 })) };
  const eventTypeAlias = {
    findMany: vi.fn(async () => [
      { id: "alias-merge", householdId: "hh", eventTypeKey: "dental", aliases: ["이닦기"] },
      { id: "alias-move", householdId: "hh-2", eventTypeKey: "dental", aliases: ["칫솔"] },
    ]),
    findFirst: vi.fn(async ({ where }: { where: { householdId?: string } }) =>
      where.householdId === "hh"
        ? { id: "alias-care", householdId: "hh", eventTypeKey: "care", aliases: ["손질"] }
        : null,
    ),
    update: vi.fn(async () => ({})),
    delete: vi.fn(async () => ({})),
  };

  const tx = { eventType, preset, event, reminder, apiToken, eventTypeAlias };
  const prisma = {
    eventType,
    preset,
    eventTypeAlias,
    $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<void>) => fn(tx)),
  };

  return { prisma, tx };
}

describe("mergeSystemEventType", () => {
  it("does nothing when the source type is absent", async () => {
    const { prisma } = mockPrisma({ care: { id: careId } });

    await mergeSystemEventType(prisma as never, { fromKey: "dental", toKey: "care" });

    expect(prisma.eventType.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("renames in place when the target is absent and rename is given", async () => {
    const { prisma } = mockPrisma({ grooming: { id: "grooming-id" } });

    await mergeSystemEventType(prisma as never, {
      fromKey: "grooming",
      toKey: "care",
      rename: { key: "care", label: "eventType.care" },
    });

    expect(prisma.eventType.update).toHaveBeenCalledWith({
      where: { id: "grooming-id" },
      data: { key: "care", label: "eventType.care" },
    });
    expect(prisma.preset.updateMany).toHaveBeenCalledWith({
      where: { eventTypeId: "grooming-id", label: "eventType.grooming" },
      data: { label: "eventType.care" },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("leaves the source alone when the target is absent and no rename is given", async () => {
    const { prisma } = mockPrisma({ dental: { id: dentalId } });

    await mergeSystemEventType(prisma as never, { fromKey: "dental", toKey: "care" });

    expect(prisma.eventType.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("moves events with a tag prefix and archives the source", async () => {
    const { prisma, tx } = mockPrisma({ dental: { id: dentalId }, care: { id: careId } });

    await mergeSystemEventType(prisma as never, {
      fromKey: "dental",
      toKey: "care",
      eventTag: "dental",
    });

    // 이미 productName이 있던 기록은 태그를 앞에 붙인다
    expect(tx.event.update).toHaveBeenCalledWith({
      where: { id: "ev-tagged" },
      data: { eventTypeId: careId, productName: "dental,치약 A" },
    });
    expect(tx.event.update).toHaveBeenCalledWith({
      where: { id: "ev-empty" },
      data: { eventTypeId: careId, productName: "dental" },
    });
    // 나머지(빈 productName)는 태그만
    expect(tx.event.updateMany).toHaveBeenCalledWith({
      where: { eventTypeId: dentalId },
      data: { eventTypeId: careId, productName: "dental" },
    });

    // 같은 pet에 care 프리셋이 이미 있으면 보관, 없으면 옮긴다 — 시드 라벨만 바꾼다
    expect(tx.preset.update).toHaveBeenCalledWith({
      where: { id: "preset-dental" },
      data: { archivedAt: expect.any(Date) },
    });
    expect(tx.preset.update).toHaveBeenCalledWith({
      where: { id: "preset-dental-custom" },
      data: { eventTypeId: careId, label: "저녁 양치" },
    });

    expect(tx.reminder.updateMany).toHaveBeenCalledWith({
      where: { eventTypeId: dentalId },
      data: { eventTypeId: careId },
    });
    // 가구별 별칭: 대상 key 행이 있으면 합치고 지운다, 없으면 key만 바꾼다
    expect(tx.eventTypeAlias.update).toHaveBeenCalledWith({
      where: { id: "alias-care" },
      data: { aliases: ["손질", "이닦기"] },
    });
    expect(tx.eventTypeAlias.delete).toHaveBeenCalledWith({ where: { id: "alias-merge" } });
    expect(tx.eventTypeAlias.update).toHaveBeenCalledWith({
      where: { id: "alias-move" },
      data: { eventTypeKey: "care" },
    });

    expect(tx.eventType.update).toHaveBeenCalledWith({
      where: { id: dentalId },
      data: { archivedAt: expect.any(Date) },
    });
  });

  it("moves events without touching productName when no tag is given", async () => {
    const { prisma, tx } = mockPrisma({ grooming: { id: "grooming-id" }, care: { id: careId } });

    await mergeSystemEventType(prisma as never, { fromKey: "grooming", toKey: "care" });

    expect(tx.event.findMany).not.toHaveBeenCalled();
    expect(tx.event.updateMany).toHaveBeenCalledWith({
      where: { eventTypeId: "grooming-id" },
      data: { eventTypeId: careId },
    });
  });
});
