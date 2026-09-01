import type { PrismaClient } from "@prisma/client";
import { householdWhere } from "./householdScope.js";

export async function upsertVetContact(
  db: PrismaClient,
  householdId: string,
  name: string,
  address?: string | null,
): Promise<string> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("CLINIC_NAME_REQUIRED");
  }
  const trimmedAddress = address?.trim() || null;

  const existing = await db.contact.findFirst({
    where: {
      ...householdWhere(householdId),
      type: "VET",
      name: trimmedName,
    },
    select: { id: true, address: true },
  });

  if (existing) {
    if (trimmedAddress && trimmedAddress !== existing.address) {
      await db.contact.update({
        where: { id: existing.id },
        data: { address: trimmedAddress },
      });
    }
    return existing.id;
  }

  const created = await db.contact.create({
    data: {
      householdId,
      type: "VET",
      name: trimmedName,
      address: trimmedAddress,
    },
    select: { id: true },
  });
  return created.id;
}
