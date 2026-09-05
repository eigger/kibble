/**
 * PATCH /api/events/:id 등에서 productId와 productName을 갱신할 때
 * 가구 격리 검증 결과 및 입력 우선순위를 적용하는 순수 함수.
 */
export function resolveEventProductFields(params: {
  productId?: string | null;
  productName?: string | null;
  householdProduct: { id: string; name: string } | null;
}): { productId?: string | null; productName?: string | null } {
  const result: { productId?: string | null; productName?: string | null } = {};

  if (params.productId !== undefined) {
    result.productId = params.householdProduct ? params.householdProduct.id : null;
  }

  if (params.productName !== undefined) {
    result.productName = params.productName?.trim() || null;
  } else if (params.productId !== undefined && params.householdProduct) {
    result.productName = params.householdProduct.name;
  }

  return result;
}
