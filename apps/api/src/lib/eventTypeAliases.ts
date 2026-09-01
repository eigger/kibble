import { prisma } from "./prisma.js";

export async function aliasesByEventTypeKey(householdId: string): Promise<Map<string, string[]>> {
  const rows = await prisma.eventTypeAlias.findMany({
    where: { householdId },
    select: { eventTypeKey: true, aliases: true },
  });
  return new Map(rows.map((row) => [row.eventTypeKey, row.aliases]));
}
