import { describe, expect, it } from "vitest";
import { loadQuickPetId, saveQuickPetId } from "./quickPet";

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe("quickPet", () => {
  it("round-trips the chosen pet id", () => {
    const s = memory();
    expect(loadQuickPetId(s)).toBeNull();
    saveQuickPetId("pet_2", s);
    expect(loadQuickPetId(s)).toBe("pet_2");
  });

  it("never throws when storage is blocked", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadQuickPetId(broken)).toBeNull();
    expect(() => saveQuickPetId("pet_1", broken)).not.toThrow();
  });
});
