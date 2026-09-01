import type { PrismaClient } from "@prisma/client";
import { householdWhere } from "./householdScope.js";

export type HistoryPeriods = {
  years: string[];
  months: string[];
  days: string[];
};

/** 반려동물 이벤트에서 KST 기준 실제 기록이 있는 연·월·일 목록 (garage history-periods 패턴). */
export async function listEventHistoryPeriods(
  db: Pick<PrismaClient, "$queryRaw">,
  householdId: string,
  petId: string,
): Promise<HistoryPeriods> {
  const rows = await db.$queryRaw<Array<{ day: string }>>`
    SELECT DISTINCT to_char(
      ((e."occurredAt" AT TIME ZONE 'UTC') + interval '9 hours')::date,
      'YYYY-MM-DD'
    ) AS day
    FROM "Event" e
    WHERE e."householdId" = ${householdId}
      AND e."petId" = ${petId}
      AND e."deletedAt" IS NULL
    ORDER BY day DESC
  `;

  const days = rows.map((r) => r.day).filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day));
  const months = [...new Set(days.map((day) => day.slice(0, 7)))];
  const years = [...new Set(months.map((ym) => ym.slice(0, 4)))];
  return { years, months, days };
}

export async function assertPetInHousehold(
  db: Pick<PrismaClient, "pet">,
  householdId: string,
  petId: string,
): Promise<boolean> {
  const pet = await db.pet.findFirst({
    where: { id: petId, ...householdWhere(householdId), archivedAt: null },
    select: { id: true },
  });
  return pet != null;
}
