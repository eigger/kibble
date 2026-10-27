import { describe, expect, it } from "vitest";
import {
  comparePurchases,
  computePurchaseSnapshot,
  currentPack,
  type PurchaseSnapshotRow,
} from "./productPurchaseSnapshot.js";

const d = (iso: string) => new Date(`${iso}T03:00:00.000Z`);

function row(id: string, over: Partial<PurchaseSnapshotRow> = {}): PurchaseSnapshotRow {
  return {
    id,
    purchasedAt: null,
    createdAt: d("2026-01-01"),
    costKrw: null,
    manufacturedAt: null,
    expiryDate: null,
    openedAt: null,
    ...over,
  };
}

describe("computePurchaseSnapshot", () => {
  it("구매가 없으면 전부 null", () => {
    expect(computePurchaseSnapshot([])).toEqual({
      purchaseDate: null,
      costKrw: null,
      manufacturedAt: null,
      expiryDate: null,
      openedAt: null,
    });
  });

  it("구매일·가격은 최신 구매에서, 과거 날짜 구매를 추가해도 바뀌지 않는다", () => {
    const rows = [
      row("a", { purchasedAt: d("2026-03-01"), costKrw: 20000 }),
      row("old", { purchasedAt: d("2025-01-01"), costKrw: 15000 }),
    ];
    expect(computePurchaseSnapshot(rows)).toMatchObject({ purchaseDate: d("2026-03-01"), costKrw: 20000 });
  });

  it("구매일 모름은 맨 뒤, 같은 날은 나중에 만든 것이 앞", () => {
    const unknown = row("u", { purchasedAt: null, costKrw: 1 });
    const dated = row("x", { purchasedAt: d("2020-01-01"), costKrw: 2 });
    expect(computePurchaseSnapshot([unknown, dated]).costKrw).toBe(2);

    const first = row("p", { purchasedAt: d("2026-05-01"), createdAt: d("2026-05-01"), costKrw: 1 });
    const second = row("q", { purchasedAt: d("2026-05-01"), createdAt: d("2026-05-02"), costKrw: 2 });
    expect(computePurchaseSnapshot([first, second]).costKrw).toBe(2);
    expect(comparePurchases(first, second)).toBeGreaterThan(0);
  });

  it("기한 3종은 쓰는 중인 봉지(개봉일이 가장 늦은 구매)에서 가져온다", () => {
    const using = row("using", {
      purchasedAt: d("2026-01-01"),
      openedAt: d("2026-01-10"),
      expiryDate: d("2027-01-01"),
      manufacturedAt: d("2025-12-01"),
    });
    const stocked = row("stock", { purchasedAt: d("2026-03-01"), expiryDate: d("2027-06-01") });
    const snap = computePurchaseSnapshot([stocked, using]);
    expect(snap.expiryDate).toEqual(d("2027-01-01"));
    expect(snap.openedAt).toEqual(d("2026-01-10"));
    expect(snap.manufacturedAt).toEqual(d("2025-12-01"));
    // 구매일·가격은 여전히 최신 구매
    expect(snap.purchaseDate).toEqual(d("2026-03-01"));
  });

  it("새 봉지를 열면 그 봉지로 넘어간다 — 먼저 산 봉지를 나중에 열어도 개봉일 기준", () => {
    const a = row("a", { purchasedAt: d("2026-01-01"), openedAt: d("2026-04-01"), expiryDate: d("2027-01-01") });
    const b = row("b", { purchasedAt: d("2026-02-01"), openedAt: d("2026-03-01"), expiryDate: d("2027-02-01") });
    expect(currentPack([a, b])?.id).toBe("a");
  });

  it("개봉한 구매가 없으면 최신 구매의 기한", () => {
    const rows = [
      row("a", { purchasedAt: d("2026-01-01"), expiryDate: d("2027-01-01") }),
      row("b", { purchasedAt: d("2026-02-01"), expiryDate: d("2027-02-01") }),
    ];
    expect(computePurchaseSnapshot(rows).expiryDate).toEqual(d("2027-02-01"));
  });

  it("최신 구매를 지우면 직전 구매로 돌아간다", () => {
    const a = row("a", { purchasedAt: d("2026-01-01"), costKrw: 10 });
    const b = row("b", { purchasedAt: d("2026-02-01"), costKrw: 20 });
    expect(computePurchaseSnapshot([a, b]).costKrw).toBe(20);
    expect(computePurchaseSnapshot([a]).costKrw).toBe(10);
  });
});
