import { kstDayKey, weightToGrams, weightToInput } from "@kibble/shared";
import type { ProductPurchase } from "./types";

/**
 * "다시 구매" 시트의 입력 상태 (WORKPLAN §7.13). 투약 이어가기와 같은 방식이다 —
 * 이전 값을 채워 열고, 사용자는 바뀐 것만 고친다.
 */
export type PurchaseDraft = {
  purchasedAt: string;
  cost: string;
  store: string;
  url: string;
  weight: string;
  weightUnit: "kg" | "g";
  manufacturedAt: string;
  expiryDate: string;
  openedAt: string;
};

/** 이전 구매에서 가져올 수 있는 값. 제품의 스냅샷도 이 모양으로 넘길 수 있다 */
export type PreviousPurchase = {
  costKrw: number | null;
  store?: string | null;
  purchaseUrl: string | null;
  weightG: number | null;
};

/** 서버 스키마(store max 80)와 맞춘다 — 길다고 구매 한 건이 통째로 거부되면 안 된다 (K-12) */
export const STORE_MAX = 80;

const day = (iso: string | null) => (iso ? kstDayKey(new Date(iso)) : "");

/**
 * 다시 구매의 초기값. 가격·구매처·링크·중량은 이어받고(대개 같은 곳에서 같은 걸 산다),
 * 구매일은 오늘, 제조일·유통기한·개봉일은 **비운다** — 봉지마다 다르고, 지난 봉지의
 * 기한을 복사해 두면 거짓 정보가 된다.
 */
export function repurchaseDraft(prev: PreviousPurchase | null, today: string): PurchaseDraft {
  const weight = weightToInput(prev?.weightG);
  return {
    purchasedAt: today,
    cost: prev?.costKrw != null ? String(prev.costKrw) : "",
    store: prev?.store ?? "",
    url: prev?.purchaseUrl ?? "",
    weight: weight.value,
    weightUnit: weight.unit,
    manufacturedAt: "",
    expiryDate: "",
    openedAt: "",
  };
}

/** 기존 구매를 고칠 때의 초기값. 저장된 그대로 보여 준다 */
export function purchaseDraftFromRow(row: ProductPurchase): PurchaseDraft {
  const weight = weightToInput(row.weightG);
  return {
    purchasedAt: day(row.purchasedAt),
    cost: row.costKrw != null ? String(row.costKrw) : "",
    store: row.store ?? "",
    url: row.purchaseUrl ?? "",
    weight: weight.value,
    weightUnit: weight.unit,
    manufacturedAt: day(row.manufacturedAt),
    expiryDate: day(row.expiryDate),
    openedAt: day(row.openedAt),
  };
}

/** 날짜 칸(YYYY-MM-DD) → 저장용 ISO. KST 정오로 둬서 어느 시간대에서 봐도 같은 날이다 */
export function dayToIso(value: string): string | null {
  return value ? new Date(`${value}T12:00:00+09:00`).toISOString() : null;
}

/**
 * 스킴이 없으면 https를 붙이고, 실행 가능한 스킴과 URL로 읽히지 않는 값은 버린다.
 * 링크 하나가 이상하다고 구매·제품 저장 전체가 거부되면 안 된다 (K-12).
 */
export function normalizePurchaseUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || /^(javascript|data|vbscript):/i.test(trimmed)) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    new URL(withScheme);
  } catch {
    return null;
  }
  return withScheme;
}

/**
 * 입력 상태 → 서버 본문. 중량은 중량 칸을 보여 주는 카테고리(`withWeight`)일 때만 보낸다 —
 * 기기·위생용품의 구매에 중량 칸이 없으므로 값이 새로 생기지 않는다.
 */
type DateKey = "purchasedAt" | "manufacturedAt" | "expiryDate" | "openedAt";

export type PurchasePayload = Partial<Record<DateKey, string | null>> & {
  costKrw: number | null;
  store: string | null;
  purchaseUrl: string | null;
  weightG?: number | null;
};

export function purchaseDraftToPayload(
  draft: PurchaseDraft,
  withWeight: boolean,
  /** 기존 구매를 고칠 때의 원래 값. 날짜 칸이 그대로면 보내지 않는다 */
  original?: PurchaseDraft,
): PurchasePayload {
  const cost = draft.cost.trim();
  // 저장된 시각(이행분·서버가 찍은 시각)을 KST 정오로 덮어쓰면 같은 날 구매의 순서가 뒤집힐 수 있다.
  // 날짜가 원래와 같으면 그 필드는 아예 보내지 않는다 (제품 PATCH가 KST 날짜로 비교하는 것과 같은 이유).
  const dateField = (key: DateKey): Partial<Record<DateKey, string | null>> =>
    original && original[key] === draft[key] ? {} : { [key]: dayToIso(draft[key]) };
  return {
    ...dateField("purchasedAt"),
    costKrw: cost ? Number(cost) : null,
    store: draft.store.trim().slice(0, STORE_MAX) || null,
    purchaseUrl: normalizePurchaseUrl(draft.url),
    ...(withWeight ? { weightG: weightToGrams(draft.weight, draft.weightUnit) } : {}),
    ...dateField("manufacturedAt"),
    ...dateField("expiryDate"),
    ...dateField("openedAt"),
  };
}
