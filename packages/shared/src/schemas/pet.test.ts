import { describe, expect, it } from "vitest";
import { updatePetSchema } from "./pet.js";

describe("updatePetSchema", () => {
  it("rejects empty patch", () => {
    const r = updatePetSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it("accepts partial fields", () => {
    const r = updatePetSchema.safeParse({ breed: "믹스" });
    expect(r.success).toBe(true);
  });

  it("validates registration number length", () => {
    expect(updatePetSchema.safeParse({ registrationNo: "123" }).success).toBe(false);
    expect(updatePetSchema.safeParse({ registrationNo: "1".repeat(15) }).success).toBe(true);
    expect(updatePetSchema.safeParse({ registrationNo: null }).success).toBe(true);
  });
});
