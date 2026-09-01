import type { PrismaClient } from "@prisma/client";
import { householdWhere } from "./householdScope.js";

export type FrequentClinic = {
  name: string;
  address: string | null;
  count: number;
};

export type ClinicSuggestions = {
  lastClinic: { name: string; address: string | null } | null;
  frequent: FrequentClinic[];
};

const EMPTY: ClinicSuggestions = { lastClinic: null, frequent: [] };

export async function clinicSuggestionsForPet(
  db: PrismaClient,
  params: {
    householdId: string;
    petId: string;
    userId?: string | null;
    frequentLimit?: number;
  },
): Promise<ClinicSuggestions> {
  const eventType = await db.eventType.findFirst({
    where: {
      key: "vet_visit",
      OR: [{ householdId: null }, { householdId: params.householdId }],
      archivedAt: null,
    },
    select: { id: true },
  });
  if (!eventType) return EMPTY;

  const baseWhere = {
    ...householdWhere(params.householdId),
    petId: params.petId,
    eventTypeId: eventType.id,
    deletedAt: null,
    contactId: { not: null },
  };

  const contactSelect = { contact: { select: { name: true, address: true } } } as const;

  let lastClinic: ClinicSuggestions["lastClinic"] = null;
  if (params.userId) {
    const mine = await db.event.findFirst({
      where: { ...baseWhere, createdById: params.userId },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      select: contactSelect,
    });
    if (mine?.contact?.name) {
      lastClinic = { name: mine.contact.name, address: mine.contact.address };
    }
  }
  if (!lastClinic) {
    const latest = await db.event.findFirst({
      where: baseWhere,
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      select: contactSelect,
    });
    if (latest?.contact?.name) {
      lastClinic = { name: latest.contact.name, address: latest.contact.address };
    }
  }

  const records = await db.event.findMany({
    where: baseWhere,
    orderBy: { occurredAt: "desc" },
    take: 100,
    select: contactSelect,
  });

  const counts = new Map<string, FrequentClinic>();
  for (const row of records) {
    const name = row.contact?.name?.trim();
    if (!name) continue;
    const existing = counts.get(name);
    if (existing) {
      existing.count += 1;
      if (!existing.address && row.contact?.address) {
        existing.address = row.contact.address;
      }
    } else {
      counts.set(name, {
        name,
        address: row.contact?.address ?? null,
        count: 1,
      });
    }
  }

  const limit = params.frequentLimit ?? 5;
  const frequent = Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  return { lastClinic, frequent };
}
