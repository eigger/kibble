import { describe, expect, it } from "vitest";
import { createPresetSchema, updatePresetSchema } from "./preset.js";

describe("createPresetSchema", () => {
  it("requires petId, eventTypeId, label", () => {
    expect(createPresetSchema.safeParse({ petId: "p1", eventTypeId: "t1", label: "사료" }).success).toBe(
      true,
    );
    expect(createPresetSchema.safeParse({ petId: "p1", eventTypeId: "t1" }).success).toBe(false);
  });
});

describe("updatePresetSchema", () => {
  it("rejects empty patch", () => {
    expect(updatePresetSchema.safeParse({}).success).toBe(false);
  });

  it("accepts hidden toggle", () => {
    expect(updatePresetSchema.safeParse({ hidden: true }).success).toBe(true);
  });
});
