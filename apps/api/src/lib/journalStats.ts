import type { PrismaClient } from "@prisma/client";
import type { JournalStats } from "@kibble/shared";
import { householdWhere } from "./householdScope.js";

/** §3.8 copy needs at most 3 distinct days; 4 rows ⇒ four or more. */
const DISTINCT_DAY_PROBE_LIMIT = 4;

export async function journalStatsForPet(
  db: Pick<PrismaClient, "event" | "$queryRaw">,
  householdId: string,
  petId: string,
): Promise<JournalStats> {
  const where = {
    ...householdWhere(householdId),
    petId,
    deletedAt: null,
  };

  const [totalEventCount, dayRows] = await Promise.all([
    db.event.count({ where }),
    db.$queryRaw<{ kst_day: Date }[]>`
      SELECT DISTINCT ((e."occurredAt" AT TIME ZONE 'UTC') + interval '9 hours')::date AS kst_day
      FROM "Event" e
      WHERE e."householdId" = ${householdId}
        AND e."petId" = ${petId}
        AND e."deletedAt" IS NULL
      ORDER BY kst_day DESC
      LIMIT ${DISTINCT_DAY_PROBE_LIMIT}
    `,
  ]);

  return { totalEventCount, distinctDayCount: dayRows.length };
}
