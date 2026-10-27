import type { Prisma } from "@prisma/client";
import { computePurchaseSnapshot, sortPurchases } from "../lib/productPurchaseSnapshot.js";

/**
 * 구매 행으로부터 Product 스냅샷을 다시 계산해 쓴다 (WORKPLAN §7.13).
 * 호출하는 쪽의 트랜잭션 안에서 부른다 — 행 변경과 스냅샷이 함께 커밋돼야 한다.
 *
 * `weightG`·`purchaseUrl`은 스냅샷이 아니라 제품 규격이라 다시 계산하지 않는다.
 * 방금 바뀐 구매(`touchedId`)가 최신이면서 값이 있을 때만 Product에 옮긴다.
 */
export async function syncProductSnapshot(
  tx: Prisma.TransactionClient,
  householdId: string,
  productId: string,
  touchedId?: string,
): Promise<void> {
  const rows = await tx.productPurchase.findMany({ where: { productId, householdId } });
  // computePurchaseSnapshot의 필드 이름이 곧 Product 컬럼 이름이다 (purchaseDate 포함)
  const update: Prisma.ProductUpdateManyMutationInput = { ...computePurchaseSnapshot(rows) };

  const latest = sortPurchases(rows)[0];
  if (touchedId && latest && latest.id === touchedId) {
    if (latest.weightG != null) update.weightG = latest.weightG;
    if (latest.purchaseUrl != null) update.purchaseUrl = latest.purchaseUrl;
  }

  await tx.product.updateMany({ where: { id: productId, householdId }, data: update });
}
