import type { Product } from "@prisma/client";

/** `_count.purchases`를 읽어 왔으면 `purchaseCount`로 내려 준다 — 웹이 시트의 읽기 전용 여부를 정한다. */
export function serializeProduct(product: Product & { _count?: { purchases: number } }) {
  const { _count, ...rest } = product;
  return {
    ...rest,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    expiryDate: product.expiryDate?.toISOString() ?? null,
    openedAt: product.openedAt?.toISOString() ?? null,
    purchaseDate: product.purchaseDate?.toISOString() ?? null,
    manufacturedAt: product.manufacturedAt?.toISOString() ?? null,
    archivedAt: product.archivedAt?.toISOString() ?? null,
    ...(_count ? { purchaseCount: _count.purchases } : {}),
  };
}
