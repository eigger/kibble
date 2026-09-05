import { describe, expect, it } from "vitest";
import {
  COST_KRW_STEP,
  COST_KRW_STEP_LARGE,
  costStepperSteps,
  quantityExtraStep,
  quantityStepperSteps,
  quantityStep,
  stepQuantityValue,
} from "./quantityStep";

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

  it("unknown written units do not inherit the type default", () => {
    expect(quantityStep("컵", "meal")).toBe(1);
    expect(quantityStep("cup", "water")).toBe(1);
    expect(quantityStepperSteps("컵", "meal")).toEqual([1]);
  });
});

describe("quantityStepperSteps", () => {
  it("meal and water get 1 and 10", () => {
    expect(quantityStepperSteps("g", "meal")).toEqual([1, 10]);
    expect(quantityStepperSteps(null, "water")).toEqual([1, 10]);
  });

  it("weight gets 0.1 and 1", () => {
    expect(quantityStepperSteps(null, "weight")).toEqual([0.1, 1]);
  });

  it("walk gets 1 and 5", () => {
    expect(quantityStepperSteps(null, "walk")).toEqual([1, 5]);
  });

  it("count stays a single 1", () => {
    expect(quantityStepperSteps("개")).toEqual([1]);
    expect(quantityExtraStep("개")).toBeNull();
  });

  it("cost gets 1000 and 10000", () => {
    expect(COST_KRW_STEP).toBe(1000);
    expect(COST_KRW_STEP_LARGE).toBe(10000);
    expect(costStepperSteps()).toEqual([1000, 10000]);
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
});
