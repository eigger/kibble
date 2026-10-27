/**
 * 구매 행 → Product 스냅샷 계산 (WORKPLAN §7.13). DB를 모르는 순수 함수다.
 *
 * ① 구매일·가격은 최신 구매에서, ② 제조일·유통기한·개봉일은 "쓰는 중인 봉지"에서 가져온다.
 * 다 먹기 전에 새 봉지를 미리 사도 쓰는 봉지의 D-Day가 사라지지 않게 하기 위해서다.
 */
export type PurchaseSnapshotRow = {
  id: string;
  purchasedAt: Date | null;
  createdAt: Date;
  costKrw: number | null;
  manufacturedAt: Date | null;
  expiryDate: Date | null;
  openedAt: Date | null;
};

export type ProductPurchaseSnapshot = {
  purchaseDate: Date | null;
  costKrw: number | null;
  manufacturedAt: Date | null;
  expiryDate: Date | null;
  openedAt: Date | null;
};

function time(value: Date | null): number {
  return value ? value.getTime() : Number.NEGATIVE_INFINITY;
}

/** 최신 구매가 앞. 구매일 없음은 맨 뒤, 같으면 나중에 만든 것이 앞. */
export function comparePurchases(a: PurchaseSnapshotRow, b: PurchaseSnapshotRow): number {
  return (
    time(b.purchasedAt) - time(a.purchasedAt) ||
    b.createdAt.getTime() - a.createdAt.getTime() ||
    (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
  );
}

/** 개봉일이 늦은 봉지가 앞. 같으면 구매 순서. */
function compareByOpened(a: PurchaseSnapshotRow, b: PurchaseSnapshotRow): number {
  return time(b.openedAt) - time(a.openedAt) || comparePurchases(a, b);
}

export function sortPurchases<T extends PurchaseSnapshotRow>(rows: readonly T[]): T[] {
  return [...rows].sort(comparePurchases);
}

/** ②가 가리키는 봉지: 개봉일이 있는 구매 중 가장 늦게 연 것, 없으면 최신 구매. */
export function currentPack<T extends PurchaseSnapshotRow>(rows: readonly T[]): T | null {
  if (rows.length === 0) return null;
  const opened = rows.filter((r) => r.openedAt).sort(compareByOpened);
  return opened[0] ?? sortPurchases(rows)[0];
}

export function computePurchaseSnapshot(rows: readonly PurchaseSnapshotRow[]): ProductPurchaseSnapshot {
  const latest = sortPurchases(rows)[0];
  const pack = currentPack(rows);
  return {
    purchaseDate: latest?.purchasedAt ?? null,
    costKrw: latest?.costKrw ?? null,
    manufacturedAt: pack?.manufacturedAt ?? null,
    expiryDate: pack?.expiryDate ?? null,
    openedAt: pack?.openedAt ?? null,
  };
}
