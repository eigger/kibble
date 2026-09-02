import type { PrismaClient } from "@prisma/client";
import { householdWhere } from "./householdScope.js";

export type VetContactDetails = {
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  placeUrl?: string | null;
};

type ContactPatch = {
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  placeUrl?: string | null;
};

/**
 * 좌표·주소는 "새 값이 있을 때만" 덮어쓴다. 병원은 재방문하므로(WORKPLAN §3.9) 한 번
 * 장소 검색으로 좌표가 붙은 Contact을, 다음 방문에서 이름만 자유 텍스트로 적었다고 해서
 * 좌표가 지워지면 안 된다.
 */
function contactPatch(existing: ContactPatch, next: VetContactDetails): ContactPatch {
  const patch: ContactPatch = {};
  const address = next.address?.trim() || null;
  const placeUrl = next.placeUrl?.trim() || null;

  if (address && address !== existing.address) patch.address = address;
  if (next.latitude != null && next.latitude !== existing.latitude) patch.latitude = next.latitude;
  if (next.longitude != null && next.longitude !== existing.longitude) {
    patch.longitude = next.longitude;
  }
  if (placeUrl && placeUrl !== existing.placeUrl) patch.placeUrl = placeUrl;
  return patch;
}

export async function upsertVetContact(
  db: PrismaClient,
  householdId: string,
  name: string,
  details: VetContactDetails = {},
): Promise<string> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("CLINIC_NAME_REQUIRED");
  }

  const existing = await db.contact.findFirst({
    where: {
      ...householdWhere(householdId),
      type: "VET",
      name: trimmedName,
    },
    select: { id: true, address: true, latitude: true, longitude: true, placeUrl: true },
  });

  if (existing) {
    const patch = contactPatch(existing, details);
    if (Object.keys(patch).length > 0) {
      await db.contact.update({ where: { id: existing.id }, data: patch });
    }
    return existing.id;
  }

  const created = await db.contact.create({
    data: {
      householdId,
      type: "VET",
      name: trimmedName,
      address: details.address?.trim() || null,
      latitude: details.latitude ?? null,
      longitude: details.longitude ?? null,
      placeUrl: details.placeUrl?.trim() || null,
    },
    select: { id: true },
  });
  return created.id;
}
