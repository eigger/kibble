/** 반려동물·이벤트 타입별 마지막 상세 입력값 — 기기 localStorage */

export type EventDetailPrefs = {
  productName?: string | null;
  quantity?: string;
  quantityOffered?: string;
  unit?: string;
};

const PREFIX = "kibble_detail_prefs";

function storageKey(petId: string, eventTypeKey: string): string {
  return `${PREFIX}:${petId}:${eventTypeKey}`;
}

export function loadEventDetailPrefs(petId: string, eventTypeKey: string): EventDetailPrefs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(petId, eventTypeKey));
    if (!raw) return null;
    return JSON.parse(raw) as EventDetailPrefs;
  } catch {
    return null;
  }
}

export function saveEventDetailPrefs(
  petId: string,
  eventTypeKey: string,
  prefs: EventDetailPrefs,
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(petId, eventTypeKey), JSON.stringify(prefs));
  } catch {
    // quota 등 — 무시
  }
}
