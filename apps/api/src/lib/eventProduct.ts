/**
 * PATCH /api/events/:id 등에서 productId와 productName을 갱신할 때
 * 가구 격리 검증 결과 및 입력 우선순위를 적용하는 순수 함수.
 */
export function resolveEventProductFields(params: {
  productId?: string | null;
  productName?: string | null;
  householdProduct: { id: string; name: string } | null;
  /**
   * productName이 태그 slug 목록인 타입(관리 등)은 false — 제품 이름이 태그 자리를
   * 차지하면 안 된다 (§7.20). 기본은 이름 스냅샷 동기화(R92).
   */
  fillNameFromProduct?: boolean;
}): { productId?: string | null; productName?: string | null } {
  const result: { productId?: string | null; productName?: string | null } = {};
  const fillName = params.fillNameFromProduct ?? true;

  if (params.productId !== undefined) {
    result.productId = params.householdProduct ? params.householdProduct.id : null;
  }

  if (params.productName !== undefined) {
    result.productName = params.productName?.trim() || null;
  } else if (fillName && params.productId !== undefined && params.householdProduct) {
    result.productName = params.householdProduct.name;
  }

  return result;
}
