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

  it("accepts free-form registration numbers", () => {
    expect(updatePetSchema.safeParse({ registrationNo: "ABC-12345" }).success).toBe(true);
    expect(updatePetSchema.safeParse({ registrationNo: null }).success).toBe(true);
  });

  it("rejects invalid dates", () => {
    expect(updatePetSchema.safeParse({ birthDate: "not-a-date" }).success).toBe(false);
    expect(updatePetSchema.safeParse({ birthDate: "2020-01-15" }).success).toBe(true);
    expect(updatePetSchema.safeParse({ birthDate: null }).success).toBe(true);
  });
});
