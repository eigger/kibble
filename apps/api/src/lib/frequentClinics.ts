import type { PrismaClient } from "@prisma/client";
import { householdWhere } from "./householdScope.js";

export type ClinicPlace = {
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  placeUrl: string | null;
};

export type FrequentClinic = ClinicPlace & {
  count: number;
};

export type ClinicSuggestions = {
  lastClinic: ClinicPlace | null;
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

  const contactSelect = {
    contact: {
      select: { name: true, address: true, latitude: true, longitude: true, placeUrl: true },
    },
  } as const;

  type ContactRow = {
    name: string;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    placeUrl: string | null;
  };

  function toPlace(contact: ContactRow): ClinicPlace {
    return {
      name: contact.name,
      address: contact.address,
      latitude: contact.latitude,
      longitude: contact.longitude,
      placeUrl: contact.placeUrl,
    };
  }

  let lastClinic: ClinicSuggestions["lastClinic"] = null;
  if (params.userId) {
    const mine = await db.event.findFirst({
      where: { ...baseWhere, createdById: params.userId },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      select: contactSelect,
    });
    if (mine?.contact?.name) {
      lastClinic = toPlace(mine.contact);
    }
  }
  if (!lastClinic) {
    const latest = await db.event.findFirst({
      where: baseWhere,
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      select: contactSelect,
    });
    if (latest?.contact?.name) {
      lastClinic = toPlace(latest.contact);
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
    const contact = row.contact;
    const name = contact?.name?.trim();
    if (!name || !contact) continue;
    const existing = counts.get(name);
    if (existing) {
      existing.count += 1;
      if (!existing.address && contact.address) existing.address = contact.address;
      if (existing.latitude == null && contact.latitude != null) {
        existing.latitude = contact.latitude;
        existing.longitude = contact.longitude;
      }
      if (!existing.placeUrl && contact.placeUrl) existing.placeUrl = contact.placeUrl;
    } else {
      counts.set(name, { ...toPlace(contact), name, count: 1 });
    }
  }

  const limit = params.frequentLimit ?? 5;
  const frequent = Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  return { lastClinic, frequent };
}
