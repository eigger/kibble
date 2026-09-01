import type { PrismaClient } from "@prisma/client";
import { kstDayKey } from "./kstClock.js";
import { householdWhere } from "./householdScope.js";

export type JournalStats = {
  totalEventCount: number;
  distinctDayCount: number;
};

export async function journalStatsForPet(
  db: Pick<PrismaClient, "event">,
  householdId: string,
  petId: string,
): Promise<JournalStats> {
  const where = {
    ...householdWhere(householdId),
    petId,
    deletedAt: null,
  };

  const [totalEventCount, rows] = await Promise.all([
    db.event.count({ where }),
    db.event.findMany({ where, select: { occurredAt: true } }),
  ]);

  const distinctDayCount = new Set(rows.map((row) => kstDayKey(row.occurredAt))).size;
  return { totalEventCount, distinctDayCount };
}
