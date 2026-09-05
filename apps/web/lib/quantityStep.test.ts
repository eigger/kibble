import { describe, expect, it } from "vitest";
import { COST_KRW_STEP, quantityStep, stepQuantityValue } from "./quantityStep";

describe("quantityStep", () => {
  it("g and ml move by 10", () => {
    expect(quantityStep("g")).toBe(10);
    expect(quantityStep("ml")).toBe(10);
    expect(quantityStep(null, "meal")).toBe(10);
    expect(quantityStep(null, "water")).toBe(10);
  });

  it("kg moves by 0.1", () => {
    expect(quantityStep("kg")).toBe(0.1);
    expect(quantityStep(null, "weight")).toBe(0.1);
  });

  it("walk minutes move by 5", () => {
    expect(quantityStep("min")).toBe(5);
    expect(quantityStep(null, "walk")).toBe(5);
  });

  it("count units move by 1", () => {
    expect(quantityStep("개")).toBe(1);
    expect(quantityStep(null, "note")).toBe(1);
  });
});

describe("stepQuantityValue", () => {
  it("starts from empty at one step", () => {
    expect(stepQuantityValue("", 10)).toBe("10");
  });

  it("does not go below zero", () => {
    expect(stepQuantityValue("5", -10)).toBe("0");
  });

  it("keeps typed values and just adds", () => {
    expect(stepQuantityValue("35", 10)).toBe("45");
  });

  it("cost step is 1000", () => {
    expect(COST_KRW_STEP).toBe(1000);
    expect(stepQuantityValue("0", COST_KRW_STEP)).toBe("1000");
  });
});
