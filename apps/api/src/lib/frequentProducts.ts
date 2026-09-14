import type { PrismaClient } from "@prisma/client";
import { householdWhere } from "./householdScope.js";

/** `productName`이 제품 이름인 타입 — 이름 제안·자주 쓰는 이름·등록 제품을 전부 받는다. */
export const PRODUCT_NAME_EVENT_KEYS = new Set(["meal", "treat", "supplement", "remedy"]);

/**
 * `productName`이 이름이 아니라 태그 slug CSV인 타입. 이름 제안·빈도는 의미가 없고, 서버가
 * 빈 `productName`을 제품 이름으로 채워서도 안 된다 — 태그 자리를 제품 이름이 차지한다.
 */
export const TAG_VALUED_PRODUCT_NAME_KEYS = new Set(["vomit", "observation", "care"]);

/**
 * 태그 타입 중 등록 제품(`productId`)만 잇는 타입 — 관리는 위생용품(모래·샴푸·치약)을 단다.
 * 이름 제안은 주지 않는다: 지난 관리(모래)와 이번 관리(양치)는 다른 일이라 엉뚱한 제품이
 * 붙는다 (§7.20). 사용자가 칩을 1탭으로 고른다.
 */
export const PRODUCT_LINK_ONLY_EVENT_KEYS = new Set(["care"]);

export function eventTypeSupportsProductName(key: string): boolean {
  return PRODUCT_NAME_EVENT_KEYS.has(key) || PRODUCT_LINK_ONLY_EVENT_KEYS.has(key);
}

export function productNameIsTagList(key: string): boolean {
  return TAG_VALUED_PRODUCT_NAME_KEYS.has(key);
}

export type FrequentProduct = {
  productName: string;
  count: number;
};

export type ActiveProductSuggestion = {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  dosage: string | null;
  isActive: boolean;
};

/** 마지막 묶음의 한 항목 — 시트가 지난 세트를 그대로 다시 연다 (§7.22) */
export type LastProductItem = {
  productId: string | null;
  productName: string | null;
  dosage: string | null;
  quantity: number | null;
  quantityOffered: number | null;
  unit: string | null;
};

export type ProductSuggestions = {
  lastProduct: string | null;
  lastProductId: string | null;
  lastProductDosage?: string | null;
  /**
   * 마지막으로 기록한 묶음의 항목들. 마지막 이벤트에 `entryId`가 있으면 그 묶음 전부(기록 순),
   * 없으면 그 한 건. `lastProduct*`는 이 배열의 첫 항목과 같다 — 옛 필드는 남겨 둔다.
   */
  lastItems: LastProductItem[];
  activeProducts: ActiveProductSuggestion[];
  frequent: FrequentProduct[];
};

const EMPTY_SUGGESTIONS: ProductSuggestions = {
  lastProduct: null,
  lastProductId: null,
  lastItems: [],
  activeProducts: [],
  frequent: [],
};

/** Prisma Decimal · number · null을 하나로 받는다. 0은 값이므로 살린다. */
function toNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "object" && "toNumber" in (value as Record<string, unknown>)) {
    const parsed = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

type LastEventRow = {
  id: string;
  entryId: string | null;
  productName: string | null;
  productId: string | null;
  quantity: unknown;
  quantityOffered: unknown;
  unit: string | null;
  product: { id: string; name: string; dosage: string | null } | null;
};

function toLastItem(row: LastEventRow): LastProductItem {
  return {
    productId: row.productId || null,
    productName: row.productName?.trim() || row.product?.name || null,
    dosage: row.product?.dosage || null,
    quantity: toNumber(row.quantity),
    quantityOffered: toNumber(row.quantityOffered),
    unit: row.unit?.trim() || null,
  };
}

export async function productSuggestionsForPet(
  db: PrismaClient,
  params: {
    householdId: string;
    petId: string;
    eventTypeKey: string;
    userId?: string | null;
    frequentLimit?: number;
  },
): Promise<ProductSuggestions> {
  if (!eventTypeSupportsProductName(params.eventTypeKey)) return EMPTY_SUGGESTIONS;

  const eventType = await db.eventType.findFirst({
    where: {
      key: params.eventTypeKey,
      OR: [{ householdId: null }, { householdId: params.householdId }],
      archivedAt: null,
    },
    select: { id: true },
  });
  if (!eventType) return EMPTY_SUGGESTIONS;

  const baseWhere = {
    ...householdWhere(params.householdId),
    petId: params.petId,
    eventTypeId: eventType.id,
    deletedAt: null,
    productName: { not: "" },
  };

  const selectEvent = {
    id: true,
    entryId: true,
    productName: true,
    productId: true,
    quantity: true,
    quantityOffered: true,
    unit: true,
    product: { select: { id: true, name: true, dosage: true } },
  };

  const suggestNames = PRODUCT_NAME_EVENT_KEYS.has(params.eventTypeKey);

  let lastEvent: LastEventRow | null = null;
  if (suggestNames && params.userId) {
    lastEvent = await db.event.findFirst({
      where: { ...baseWhere, createdById: params.userId },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      select: selectEvent,
    });
  }
  if (suggestNames && !lastEvent) {
    lastEvent = await db.event.findFirst({
      where: baseWhere,
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      select: selectEvent,
    });
  }

  // 마지막 이벤트가 묶음(entryId)의 일부면 묶음 전부를 기록 순으로 — 여러 제품을 한 번에
  // 먹인 세트를 다음번에 그대로 다시 연다 (§7.22). 묶음 조회도 가구·반려동물·타입 스코프다 (K-1).
  let lastItems: LastProductItem[] = [];
  if (lastEvent?.entryId) {
    const grouped = await db.event.findMany({
      where: { ...baseWhere, entryId: lastEvent.entryId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 20,
      select: selectEvent,
    });
    lastItems = grouped.map(toLastItem);
  } else if (lastEvent) {
    lastItems = [toLastItem(lastEvent)];
  }

  const lastProduct = lastItems[0]?.productName ?? null;
  const lastProductId = lastItems[0]?.productId ?? null;
  const lastProductDosage = lastItems[0]?.dosage ?? null;

  // Active products matching this event type's category
  const categoryByKey: Record<string, "MEAL" | "SUPPLEMENT" | "TREAT" | "MEDICATION" | "HYGIENE"> = {
    meal: "MEAL",
    supplement: "SUPPLEMENT",
    treat: "TREAT",
    remedy: "MEDICATION",
    care: "HYGIENE",
  };
  const category = categoryByKey[params.eventTypeKey];

  const activeRows = await db.product.findMany({
    where: {
      ...householdWhere(params.householdId),
      archivedAt: null,
      isActive: true,
      OR: [{ petId: null }, { petId: params.petId }],
      ...(category ? { category } : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      brand: true,
      category: true,
      dosage: true,
      isActive: true,
    },
  });

  const activeProducts: ActiveProductSuggestion[] = activeRows.map((r) => ({
    id: r.id,
    name: r.name,
    brand: r.brand,
    category: r.category,
    dosage: r.dosage,
    isActive: r.isActive,
  }));

  const records = suggestNames
    ? await db.event.findMany({
        where: baseWhere,
        orderBy: { occurredAt: "desc" },
        take: 100,
        select: { productName: true },
      })
    : [];

  const counts = new Map<string, number>();
  for (const row of records) {
    const name = row.productName?.trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const limit = params.frequentLimit ?? 5;
  const frequent = Array.from(counts.entries())
    .map(([productName, count]) => ({ productName, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  return { lastProduct, lastProductId, lastProductDosage, lastItems, activeProducts, frequent };
}
