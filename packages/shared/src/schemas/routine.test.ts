import { describe, expect, it } from "vitest";
import { createRoutineSchema, updateRoutineSchema } from "./routine.js";

describe("createRoutineSchema", () => {
  it("requires petId, label and at least one item", () => {
    expect(
      createRoutineSchema.safeParse({
        petId: "p1",
        label: "아침",
        items: [{ eventTypeId: "t1", quantity: "10", unit: "g" }],
      }).success,
    ).toBe(true);
    expect(createRoutineSchema.safeParse({ petId: "p1", label: "아침", items: [] }).success).toBe(
      false,
    );
    expect(createRoutineSchema.safeParse({ petId: "p1", items: [{ eventTypeId: "t1" }] }).success).toBe(
      false,
    );
  });

  it("accepts a long tag list as productName", () => {
    const productName = Array.from({ length: 20 }, (_, i) => `tag_number_${i}`).join(",");
    expect(
      createRoutineSchema.safeParse({
        petId: "p1",
        label: "관찰",
        items: [{ eventTypeId: "t1", productName }],
      }).success,
    ).toBe(true);
  });

  it("coerces quantity to a number", () => {
    const parsed = createRoutineSchema.parse({
      petId: "p1",
      label: "물",
      items: [{ eventTypeId: "t1", quantity: "5.5" }],
    });
    expect(parsed.items[0].quantity).toBe(5.5);
  });
});

describe("updateRoutineSchema", () => {
  it("rejects empty patch", () => {
    expect(updateRoutineSchema.safeParse({}).success).toBe(false);
  });

  it("accepts items replacement", () => {
    expect(updateRoutineSchema.safeParse({ items: [{ eventTypeId: "t1" }] }).success).toBe(true);
  });
});
