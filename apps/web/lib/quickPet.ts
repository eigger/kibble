/** /q가 마지막으로 고른 반려동물 — 기기에 기억해 다음에 열 때 그 아이로 바로 기록한다. 1마리면 쓰이지 않는다. */
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
