import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import {
  QUICK_HOME_CACHE_TTL_MS,
  clearQuickHomeCache,
  coursesActiveAt,
  loadCachedPetList,
  loadQuickHomeCache,
  saveQuickHomeCache,
  shouldUseQuickHomeCache,
  type QuickHomeStorage,
  type UpcomingCourse,
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
  upcomingCourses: [] as UpcomingCourse[],
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

  it("does not substitute another pet when the requested pet still exists", () => {
    const s = memory();
    // b의 스냅샷만 있고, 그 목록에는 a도 있다 — a는 지금도 있는 아이다
    saveQuickHomeCache(me, snap("b"), NOW, s);
    expect(loadQuickHomeCache(me, "a", { now: NOW + 1, storage: s })).toBeNull();
    // 목록에 없는 id(보관·삭제)는 최근 스냅샷으로 시작한다
    expect(loadQuickHomeCache(me, "gone", { now: NOW + 1, storage: s })?.activePet.id).toBe("b");
  });

  it("lists pets from the newest snapshot so tabs can be shown after a miss", () => {
    const s = memory();
    expect(loadCachedPetList(me, { storage: s })).toEqual([]);
    saveQuickHomeCache(me, snap("b"), NOW, s);
    expect(loadCachedPetList(me, { now: NOW + 1, storage: s }).map((p) => p.id)).toEqual(["a", "b"]);
    expect(loadCachedPetList({ userId: "u2", householdId: "h1" }, { now: NOW + 1, storage: s })).toEqual([]);
    expect(loadCachedPetList(me, { now: NOW + QUICK_HOME_CACHE_TTL_MS + 1, storage: s })).toEqual([]);
  });

  it("treats entries with missing arrays or another version as absent", () => {
    const s = memory();
    saveQuickHomeCache(me, snap("a"), NOW, s);
    const key = "kibble_quick_home:u1:a";
    const base = JSON.parse(s.getItem(key)!);
    for (const broken of [
      { ...base, pets: undefined },
      { ...base, courses: undefined },
      { ...base, presets: "x" },
      { ...base, v: 0 },
    ]) {
      s.setItem(key, JSON.stringify(broken));
      expect(loadQuickHomeCache(me, "a", { now: NOW, storage: s })).toBeNull();
    }
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

describe("upcoming courses in the snapshot", () => {
  const upcoming = (id: string, startDate: string): UpcomingCourse => ({
    id,
    name: id,
    dosesPerDay: 1,
    doseTimes: ["08:00"],
    startDate,
  });

  it("round-trips upcoming courses", () => {
    const s = memory();
    saveQuickHomeCache(me, { ...snap("a"), upcomingCourses: [upcoming("u1", "2026-09-03T12:00:00+09:00")] }, NOW, s);
    const loaded = loadQuickHomeCache(me, "a", { now: NOW, storage: s });
    expect(loaded?.upcomingCourses.map((c) => c.id)).toEqual(["u1"]);
  });

  it("discards an older-version snapshot (v2 had no course end dates)", () => {
    const s = memory();
    saveQuickHomeCache(me, snap("a"), NOW, s);
    const key = "kibble_quick_home:u1:a";
    const entry = JSON.parse(s.getItem(key)!);
    entry.v = 2;
    s.setItem(key, JSON.stringify(entry));
    expect(loadQuickHomeCache(me, "a", { now: NOW, storage: s })).toBeNull();
  });

  it("discards a v1 snapshot that has no upcoming list", () => {
    const s = memory();
    saveQuickHomeCache(me, snap("a"), NOW, s);
    const key = "kibble_quick_home:u1:a";
    const entry = JSON.parse(s.getItem(key)!);
    delete entry.upcomingCourses;
    entry.v = 1;
    s.setItem(key, JSON.stringify(entry));
    expect(loadQuickHomeCache(me, "a", { now: NOW, storage: s })).toBeNull();
  });

  const build = (c: UpcomingCourse) => ({ id: c.id });

  it("activates a course whose start day has come, even in the morning before its noon timestamp", () => {
    const list = [upcoming("u1", "2026-09-03T12:00:00+09:00")];
    const morning = new Date("2026-09-03T07:55:00+09:00");
    expect(coursesActiveAt([{ id: "c1" }], list, morning, build).map((c) => c.id)).toEqual(["c1", "u1"]);
  });

  it("drops a previous course that ended before today and adds the new one (D-1 snapshot opened on day D)", () => {
    const previous = { id: "old", endDate: "2026-09-02T12:00:00+09:00" };
    const list = [upcoming("new", "2026-09-03T12:00:00+09:00")];
    const morning = new Date("2026-09-03T07:55:00+09:00");
    const withEnd = (c: UpcomingCourse) => ({ id: c.id, endDate: null as string | null });
    expect(coursesActiveAt([previous], list, morning, withEnd).map((c) => c.id)).toEqual(["new"]);
  });

  it("keeps a course through its whole end day and drops it the day after", () => {
    const ending = { id: "c1", endDate: "2026-09-03T12:00:00+09:00" };
    const withEnd = (c: UpcomingCourse) => ({ id: c.id });
    expect(coursesActiveAt([ending], [], new Date("2026-09-03T00:10:00+09:00"), withEnd)).toHaveLength(1);
    expect(coursesActiveAt([ending], [], new Date("2026-09-03T23:50:00+09:00"), withEnd)).toHaveLength(1);
    expect(coursesActiveAt([ending], [], new Date("2026-09-04T00:00:00+09:00"), withEnd)).toHaveLength(0);
  });

  it("keeps a still-upcoming course out and never duplicates a known id", () => {
    const list = [upcoming("u1", "2026-09-04T12:00:00+09:00"), upcoming("c1", "2026-09-03T12:00:00+09:00")];
    const now = new Date("2026-09-03T09:00:00+09:00");
    expect(coursesActiveAt([{ id: "c1" }], list, now, build).map((c) => c.id)).toEqual(["c1"]);
  });
});
