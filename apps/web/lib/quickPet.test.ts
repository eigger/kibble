import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { fetchQuickHome, loadQuickPetId, saveQuickPetId } from "./quickPet";

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

describe("fetchQuickHome", () => {
  it("falls back to the first pet on 404 and overwrites the stored id", async () => {
    const calls: (string | null)[] = [];
    const saved: string[] = [];
    const data = await fetchQuickHome(
      async (petId) => {
        calls.push(petId);
        if (petId) throw new ApiError("gone", 404);
        return { activePet: { id: "pet_first" } };
      },
      "pet_gone",
      (id) => saved.push(id),
    );
    expect(calls).toEqual(["pet_gone", null]);
    expect(saved).toEqual(["pet_first"]);
    expect(data.activePet?.id).toBe("pet_first");
  });

  it("does not swallow other errors or retry without a stored id", async () => {
    await expect(
      fetchQuickHome(async () => Promise.reject(new ApiError("boom", 500)), "pet_1", () => {}),
    ).rejects.toMatchObject({ status: 500 });
    let n = 0;
    await expect(
      fetchQuickHome(
        async () => {
          n += 1;
          throw new ApiError("gone", 404);
        },
        null,
        () => {},
      ),
    ).rejects.toBeInstanceOf(ApiError);
    expect(n).toBe(1);
  });
});
