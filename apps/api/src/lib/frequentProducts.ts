import type { PrismaClient } from "@prisma/client";
import { householdWhere } from "./householdScope.js";

export const PRODUCT_NAME_EVENT_KEYS = new Set(["meal", "treat", "supplement"]);

export function eventTypeSupportsProductName(key: string): boolean {
  return PRODUCT_NAME_EVENT_KEYS.has(key);
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

export type ProductSuggestions = {
  lastProduct: string | null;
  lastProductId: string | null;
  lastProductDosage?: string | null;
  activeProducts: ActiveProductSuggestion[];
  frequent: FrequentProduct[];
};

const EMPTY_SUGGESTIONS: ProductSuggestions = {
  lastProduct: null,
  lastProductId: null,
  activeProducts: [],
  frequent: [],
};

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

  let lastProduct: string | null = null;
  let lastProductId: string | null = null;
  let lastProductDosage: string | null = null;

  const selectEvent = {
    productName: true,
    productId: true,
    product: { select: { id: true, name: true, dosage: true } },
  };

  if (params.userId) {
    const mine = await db.event.findFirst({
      where: { ...baseWhere, createdById: params.userId },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      select: selectEvent,
    });
    if (mine) {
      lastProduct = mine.productName?.trim() || mine.product?.name || null;
      lastProductId = mine.productId || null;
      lastProductDosage = mine.product?.dosage || null;
    }
  }
  if (!lastProduct && !lastProductId) {
    const latest = await db.event.findFirst({
      where: baseWhere,
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      select: selectEvent,
    });
    if (latest) {
      lastProduct = latest.productName?.trim() || latest.product?.name || null;
      lastProductId = latest.productId || null;
      lastProductDosage = latest.product?.dosage || null;
    }
  }

  // Active products matching this event type's category
  const categoryByKey: Record<string, "MEAL" | "SUPPLEMENT" | "TREAT"> = {
    meal: "MEAL",
    supplement: "SUPPLEMENT",
    treat: "TREAT",
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

  const records = await db.event.findMany({
    where: baseWhere,
    orderBy: { occurredAt: "desc" },
    take: 100,
    select: { productName: true },
  });

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

  return { lastProduct, lastProductId, lastProductDosage, activeProducts, frequent };
}
