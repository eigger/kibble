import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import {
  QUICK_HOME_CACHE_TTL_MS,
  clearQuickHomeCache,
  loadQuickHomeCache,
  saveQuickHomeCache,
  shouldUseQuickHomeCache,
  type QuickHomeStorage,
} from "./quickHomeCache";

function memory(): QuickHomeStorage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

const pet = (id: string) => ({ id, name: id, species: "DOG", sortOrder: 0, photoPath: "/secret.jpg" });
const snap = (id: string) => ({
  pets: [pet("a"), pet("b")],
  activePet: pet(id),
  presets: [{ id: "p1" }],
  routines: [{ id: "r1" }],
  courses: [{ id: "c1" }],
});
const me = { userId: "u1", householdId: "h1" };
const NOW = 1_700_000_000_000;

describe("quickHomeCache", () => {
  it("round-trips chips, routines, courses and pets, dropping extra pet fields", () => {
    const s = memory();
    saveQuickHomeCache(me, snap("a"), NOW, s);
    const loaded = loadQuickHomeCache<{ id: string }, { id: string }, { id: string }>(me, "a", { now: NOW + 1000, storage: s });
    expect(loaded?.presets).toEqual([{ id: "p1" }]);
    expect(loaded?.routines).toEqual([{ id: "r1" }]);
    expect(loaded?.courses).toEqual([{ id: "c1" }]);
    expect(loaded?.pets.map((p) => p.id)).toEqual(["a", "b"]);
    expect(loaded?.savedAt).toBe(NOW);
    expect(JSON.stringify(loaded)).not.toContain("secret");
  });

  it("ignores snapshots of another user or household", () => {
    const s = memory();
    saveQuickHomeCache(me, snap("a"), NOW, s);
    expect(loadQuickHomeCache({ userId: "u2", householdId: "h1" }, "a", { now: NOW, storage: s })).toBeNull();
    // 같은 키에 다른 가구가 들어 있어도(가구 이동) 쓰지 않는다
    expect(loadQuickHomeCache({ userId: "u1", householdId: "h2" }, "a", { now: NOW, storage: s })).toBeNull();
  });

  it("expires after the TTL", () => {
    const s = memory();
    saveQuickHomeCache(me, snap("a"), NOW, s);
    expect(loadQuickHomeCache(me, "a", { now: NOW + QUICK_HOME_CACHE_TTL_MS + 1, storage: s })).toBeNull();
    expect(loadQuickHomeCache(me, "a", { now: NOW + QUICK_HOME_CACHE_TTL_MS, storage: s })).not.toBeNull();
  });

  it("falls back to the newest pet unless strict", () => {
    const s = memory();
    saveQuickHomeCache(me, snap("a"), NOW, s);
    saveQuickHomeCache(me, snap("b"), NOW + 10, s);
    expect(loadQuickHomeCache(me, null, { now: NOW + 20, storage: s })?.activePet.id).toBe("b");
    expect(loadQuickHomeCache(me, "gone", { now: NOW + 20, storage: s })?.activePet.id).toBe("b");
    expect(loadQuickHomeCache(me, "gone", { strict: true, now: NOW + 20, storage: s })).toBeNull();
  });

  it("clears every user's snapshots but nothing else", () => {
    const s = memory();
    saveQuickHomeCache(me, snap("a"), NOW, s);
    saveQuickHomeCache({ userId: "u2", householdId: "h1" }, snap("a"), NOW, s);
    s.setItem("kibble_cached_user", "{}");
    clearQuickHomeCache(s);
    expect(s.length).toBe(1);
    expect(s.getItem("kibble_cached_user")).toBe("{}");
  });

  it("survives corrupt data and blocked storage", () => {
    const s = memory();
    s.setItem("kibble_quick_home:u1:a", "{not json");
    expect(loadQuickHomeCache(me, "a", { now: NOW, storage: s })).toBeNull();
    const blocked: QuickHomeStorage = {
      length: 0,
      key: () => null,
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => saveQuickHomeCache(me, snap("a"), NOW, blocked)).not.toThrow();
    expect(loadQuickHomeCache(me, "a", { now: NOW, storage: blocked })).toBeNull();
    expect(() => clearQuickHomeCache(blocked)).not.toThrow();
  });

  it("uses the cache only for transient failures", () => {
    expect(shouldUseQuickHomeCache(new Error("network"))).toBe(true);
    expect(shouldUseQuickHomeCache(new ApiError("x", 503))).toBe(true);
    expect(shouldUseQuickHomeCache(new ApiError("x", 401))).toBe(false);
    expect(shouldUseQuickHomeCache(new ApiError("x", 403))).toBe(false);
    expect(shouldUseQuickHomeCache(new ApiError("x", 404))).toBe(false);
  });
});
