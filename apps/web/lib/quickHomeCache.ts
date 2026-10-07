import { courseStartsByTodayBefore } from "@kibble/shared";
import { isApiError } from "./api";

/**
 * /q 오프라인 시작용 스냅샷 — 마지막으로 성공한 `/api/home`에서 **칩·루틴·활성 처방·반려동물**만
 * 기억한다. 타임라인(최근 기록)과 오늘 복약 진행은 일부러 뺀다. 오래된 "오늘 기록"은 이미 먹였는지를
 * 오해하게 만들지만, 칩 목록은 며칠이 지나도 거의 안 변한다. 틀려도 서버가 거른다 — 보관된 칩은
 * 404, 이미 먹인 복약은 409로 오프라인 큐가 영구 거부로 알린다.
 *
 * 저장소는 localStorage다. 작은 JSON이고(`kibble_cached_user`와 같은 결), 동기라 로딩 화면 없이
 * 읽으며, 스키마·마이그레이션이 없다. 사용자 id로 키를 나누고 값에도 userId·householdId를 넣어
 * 다시 확인한다. 로그아웃(`clearLocalSession`)이 전부 지운다.
 */
const PREFIX = "kibble_quick_home:";
/**
 * 저장 형태 버전. `/api/home` 응답에서 우리가 읽는 필드(pets·activePet·presets·routines·
 * activeMedicationCourses·upcomingMedicationCourses)의 형태가 바뀌면 **반드시 올린다** — 옛 항목은
 * 버려지고 새로 받는다. v2: 시작 전 처방(`upcomingCourses`)을 함께 저장한다 — 어제 예정이던 처방이
 * 시작일 아침 오프라인 스냅샷에서 빠지지 않게. v1 스냅샷은 버려진다(한 번 새로 받으면 채워지는 캐시).
 */
const VERSION = 2;
/** 이보다 오래된 스냅샷은 쓰지 않는다 — 칩을 정리한 지 한 달이 지났으면 새로 받는 게 맞다. */
export const QUICK_HOME_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface QuickHomeStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface CachedPet {
  id: string;
  name: string;
  species: string;
  sortOrder: number;
}

/** 시작 전 처방의 최소 필드 — 시작일이 되면 클라이언트가 활성으로 본다. */
export interface UpcomingCourse {
  id: string;
  name: string;
  dosesPerDay: number;
  doseTimes: string[];
  startDate: string;
}

/** `/api/home` 응답에서 캐시하는 부분. 제네릭이라 화면의 타입을 그대로 쓴다. */
export interface QuickHomeSnapshot<TPreset, TRoutine, TCourse> {
  pets: CachedPet[];
  activePet: CachedPet;
  presets: TPreset[];
  routines: TRoutine[];
  courses: TCourse[];
  upcomingCourses: UpcomingCourse[];
}

interface StoredEntry<TPreset, TRoutine, TCourse> extends QuickHomeSnapshot<TPreset, TRoutine, TCourse> {
  v: number;
  userId: string;
  householdId: string | null;
  savedAt: number;
}

export interface LoadedQuickHome<TPreset, TRoutine, TCourse>
  extends QuickHomeSnapshot<TPreset, TRoutine, TCourse> {
  savedAt: number;
}

function defaultStorage(): QuickHomeStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

const keyFor = (userId: string, petId: string) => `${PREFIX}${userId}:${petId}`;

function slimPet(pet: { id: string; name: string; species: string; sortOrder: number }): CachedPet {
  return { id: pet.id, name: pet.name, species: pet.species, sortOrder: pet.sortOrder };
}

export function saveQuickHomeCache<TPreset, TRoutine, TCourse>(
  who: { userId: string; householdId: string | null },
  snapshot: QuickHomeSnapshot<TPreset, TRoutine, TCourse>,
  now = Date.now(),
  storage: QuickHomeStorage | undefined = defaultStorage(),
): void {
  if (!storage) return;
  const entry: StoredEntry<TPreset, TRoutine, TCourse> = {
    ...snapshot,
    pets: snapshot.pets.map(slimPet),
    activePet: slimPet(snapshot.activePet),
    v: VERSION,
    userId: who.userId,
    householdId: who.householdId,
    savedAt: now,
  };
  try {
    storage.setItem(keyFor(who.userId, snapshot.activePet.id), JSON.stringify(entry));
  } catch {
    // 용량·차단 — 캐시가 없을 뿐 화면은 동작한다
  }
}

function parseEntry<TPreset, TRoutine, TCourse>(
  raw: string | null,
  who: { userId: string; householdId: string | null },
  now: number,
): StoredEntry<TPreset, TRoutine, TCourse> | null {
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw) as StoredEntry<TPreset, TRoutine, TCourse>;
    if (entry?.v !== VERSION) return null;
    if (entry.userId !== who.userId || entry.householdId !== who.householdId) return null;
    if (typeof entry.savedAt !== "number" || now - entry.savedAt > QUICK_HOME_CACHE_TTL_MS) return null;
    if (
      !entry.activePet?.id ||
      !Array.isArray(entry.pets) ||
      !Array.isArray(entry.presets) ||
      !Array.isArray(entry.routines) ||
      !Array.isArray(entry.courses) ||
      !Array.isArray(entry.upcomingCourses)
    ) {
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

/**
 * 요청한 반려동물의 스냅샷. 없으면 이 사용자의 가장 최근 스냅샷으로 대신하되, 엉뚱한 아이에게
 * 기록되지 않도록 둘 중 하나면 대신하지 않는다(null → 화면은 오류). (1) `strict` — 사용자가 탭으로
 * 그 아이를 직접 골랐다. (2) 요청한 아이가 스냅샷의 반려동물 목록에 있다 — 지금도 있는 아이인데
 * 그 아이의 스냅샷만 없는 것이다. 요청한 id가 어디에도 없을 때(보관·삭제)만 최근 스냅샷으로 시작한다.
 * 사용자·가구가 다르거나 만료·손상된 항목은 무시한다.
 */
export function loadQuickHomeCache<TPreset, TRoutine, TCourse>(
  who: { userId: string; householdId: string | null },
  petId: string | null,
  options: { strict?: boolean; now?: number; storage?: QuickHomeStorage } = {},
): LoadedQuickHome<TPreset, TRoutine, TCourse> | null {
  const { strict = false, now = Date.now() } = options;
  const storage = options.storage ?? defaultStorage();
  if (!storage) return null;
  try {
    if (petId) {
      const exact = parseEntry<TPreset, TRoutine, TCourse>(storage.getItem(keyFor(who.userId, petId)), who, now);
      if (exact) return exact;
    }
    const userPrefix = `${PREFIX}${who.userId}:`;
    let best: StoredEntry<TPreset, TRoutine, TCourse> | null = null;
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (!key || !key.startsWith(userPrefix)) continue;
      const entry = parseEntry<TPreset, TRoutine, TCourse>(storage.getItem(key), who, now);
      if (entry && (!best || entry.savedAt > best.savedAt)) best = entry;
    }
    if (!best || !petId || best.activePet.id === petId) return best;
    if (strict || best.pets.some((p) => p.id === petId)) return null;
    return best;
  } catch {
    return null;
  }
}

/**
 * 이 사용자의 가장 최근 스냅샷에 든 반려동물 목록 — 요청한 아이의 스냅샷이 없어 화면이 오류가
 * 될 때도 탭만은 채워, 사용자가 스냅샷이 있는 다른 아이로 전환할 수 있게 한다. 기록은 탭으로 고른
 * 아이의 스냅샷으로만 나가므로 엉뚱한 아이에게 쓰이지 않는다.
 */
export function loadCachedPetList(
  who: { userId: string; householdId: string | null },
  options: { now?: number; storage?: QuickHomeStorage } = {},
): CachedPet[] {
  return loadQuickHomeCache<unknown, unknown, unknown>(who, null, options)?.pets ?? [];
}

/**
 * 스냅샷의 처방 목록 — 저장 당시 오늘 대상이던 처방에, 그 뒤 시작일이 된 예정 처방을 더한다. 서버와
 * 같은 KST 날짜 규칙(`courseStartsByTodayBefore`)으로 판정한다. 이미 있는 id는 중복해 넣지 않는다.
 */
export function coursesActiveAt<TCourse extends { id: string }>(
  courses: TCourse[],
  upcoming: UpcomingCourse[],
  now: Date,
  build: (course: UpcomingCourse) => TCourse,
): TCourse[] {
  const limit = courseStartsByTodayBefore(now);
  const known = new Set(courses.map((c) => c.id));
  const started = upcoming
    .filter((c) => !known.has(c.id) && new Date(c.startDate) < limit)
    .map(build);
  return [...courses, ...started];
}

/** 로그아웃·계정 전환 — 모든 사용자의 스냅샷을 지운다. */
export function clearQuickHomeCache(storage: QuickHomeStorage | undefined = defaultStorage()): void {
  if (!storage) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    keys.forEach((key) => storage.removeItem(key));
  } catch {
    // 지우지 못해도 로그아웃을 막지 않는다 — 읽을 때 userId를 다시 확인한다
  }
}

/** 일시 오류(네트워크·5xx)일 때만 캐시로 그린다. 4xx(인증·권한·404)는 그대로 오류다. */
export function shouldUseQuickHomeCache(err: unknown): boolean {
  if (isApiError(err)) return err.status >= 500;
  return true;
}
