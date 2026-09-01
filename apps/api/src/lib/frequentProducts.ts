import type { PrismaClient } from "@prisma/client";
import { householdWhere } from "./householdScope.js";

export const PRODUCT_NAME_EVENT_KEYS = new Set(["meal", "treat"]);

export function eventTypeSupportsProductName(key: string): boolean {
  return PRODUCT_NAME_EVENT_KEYS.has(key);
}

export type FrequentProduct = {
  productName: string;
  count: number;
};

export type ProductSuggestions = {
  lastProduct: string | null;
  frequent: FrequentProduct[];
};

const EMPTY_SUGGESTIONS: ProductSuggestions = { lastProduct: null, frequent: [] };

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
  if (params.userId) {
    const mine = await db.event.findFirst({
      where: { ...baseWhere, createdById: params.userId },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      select: { productName: true },
    });
    lastProduct = mine?.productName?.trim() || null;
  }
  if (!lastProduct) {
    const latest = await db.event.findFirst({
      where: baseWhere,
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      select: { productName: true },
    });
    lastProduct = latest?.productName?.trim() || null;
  }

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

  return { lastProduct, frequent };
}
