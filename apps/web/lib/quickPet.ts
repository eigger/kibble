/** /q가 마지막으로 고른 반려동물 — 기기에 기억해 다음에 열 때 그 아이로 바로 기록한다. 1마리면 쓰이지 않는다. */
import { isApiError } from "./api";

const KEY = "kibble:quickPetId";

export function loadQuickPetId(storage: Pick<Storage, "getItem"> | undefined = safeStorage()): string | null {
  try {
    return storage?.getItem(KEY) || null;
  } catch {
    return null;
  }
}

export function saveQuickPetId(
  petId: string,
  storage: Pick<Storage, "setItem"> | undefined = safeStorage(),
): void {
  try {
    storage?.setItem(KEY, petId);
  } catch {
    // 저장 못 해도 이번 화면은 동작한다
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/**
 * 기억한 반려동물로 홈 데이터를 받는다. 그 아이가 사라졌으면(404) 첫 번째로 되돌아가고,
 * 저장값을 지금 아이로 덮어써 다음 열 때 같은 404 요청이 나가지 않게 한다.
 */
export async function fetchQuickHome<T extends { activePet: { id: string } | null }>(
  fetchHome: (petId: string | null) => Promise<T>,
  requestedPetId: string | null,
  save: (petId: string) => void = saveQuickPetId,
): Promise<T> {
  try {
    return await fetchHome(requestedPetId);
  } catch (err) {
    if (!requestedPetId || !isApiError(err) || err.status !== 404) throw err;
    const data = await fetchHome(null);
    if (data.activePet) save(data.activePet.id);
    return data;
  }
}
