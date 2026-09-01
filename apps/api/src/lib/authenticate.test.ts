import { describe, expect, it } from "vitest";
import { resolveTokenScopedField } from "./authenticate.js";
import { validateScaleValue, CreateEventValidationError } from "../services/createEvent.js";

describe("resolveTokenScopedField", () => {
  it("returns token value when body omitted", () => {
    expect(resolveTokenScopedField(undefined, "preset_1")).toEqual({
      value: "preset_1",
      mismatch: false,
    });
  });

  it("flags mismatch when body overrides token scope", () => {
    expect(resolveTokenScopedField("preset_2", "preset_1")).toEqual({
      value: undefined,
      mismatch: true,
    });
  });

  it("allows body when token has no scope", () => {
    expect(resolveTokenScopedField("preset_2", null)).toEqual({
      value: "preset_2",
      mismatch: false,
    });
  });
});

describe("validateScaleValue", () => {
  it("accepts FECAL_7 range 1-7", () => {
    expect(() => validateScaleValue("FECAL_7", 4)).not.toThrow();
  });

  it("rejects FECAL_7 out of range", () => {
    expect(() => validateScaleValue("FECAL_7", 8)).toThrow(CreateEventValidationError);
  });

  it("accepts URINE_AMOUNT_3 range 1-3", () => {
    expect(() => validateScaleValue("URINE_AMOUNT_3", 2)).not.toThrow();
  });

  it("rejects scale value when type has no scale", () => {
    expect(() => validateScaleValue(null, 3)).toThrow(CreateEventValidationError);
  });
});
