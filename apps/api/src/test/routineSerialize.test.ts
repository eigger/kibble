import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("../lib/prisma.js", () => ({ prisma: {} }));

const { serializeRoutine, itemRows } = await import("../routes/routines.js");

function medicationRow(course: { endDate: Date | null; archivedAt: Date | null } | null) {
  return {
    id: "r1",
    petId: "pet_a",
    label: "아침",
    sortOrder: 0,
    items: [
      {
        id: "i1",
        sortOrder: 0,
        eventTypeId: "et_med",
        presetId: "ps_med",
        productId: null,
        productName: null,
        quantity: null as Prisma.Decimal | null,
        quantityOffered: null as Prisma.Decimal | null,
        unit: null,
        medicationCourseId: course ? "c1" : null,
        eventType: { key: "medication", label: "투약", category: "HEALTH" as const, defaultUnit: null },
        preset: { id: "ps_med", label: "투약", archivedAt: null },
        product: null,
        course: course ? { id: "c1", name: "아침약", ...course } : null,
      },
    ],
  };
}

describe("serializeRoutine — 투약 항목 (§7.24)", () => {
  const now = new Date("2026-09-29T03:00:00.000Z");

  it("returns the course id so the edit sheet can show the chosen course", () => {
    const [item] = serializeRoutine(medicationRow({ endDate: null, archivedAt: null }), now).items;
    expect(item.medicationCourseId).toBe("c1");
    expect(item.course).toEqual({ id: "c1", name: "아침약", ended: false });
  });

  it("serializes quantityOffered as a number", () => {
    const row = medicationRow({ endDate: null, archivedAt: null });
    row.items[0].quantityOffered = new Prisma.Decimal("10.5");
    expect(serializeRoutine(row, now).items[0].quantityOffered).toBe(10.5);
  });

  it("marks an archived course as ended but keeps its id", () => {
    const [item] = serializeRoutine(
      medicationRow({ endDate: null, archivedAt: new Date("2026-09-20T00:00:00.000Z") }),
      now,
    ).items;
    expect(item.medicationCourseId).toBe("c1");
    expect(item.course?.ended).toBe(true);
  });
});

describe("itemRows — 제공량은 사료만 (§7.24)", () => {
  it("keeps quantityOffered for meal items and drops it for other types", () => {
    const rows = itemRows(
      "h1",
      [
        { eventTypeId: "et_meal", quantity: 8, quantityOffered: 10 },
        { eventTypeId: "et_water", quantity: 5, quantityOffered: 7 },
      ],
      new Set(),
      new Set(["et_meal"]),
    );
    expect(rows[0].quantityOffered).toBe(10);
    expect(rows[1].quantityOffered).toBeNull();
  });
});
