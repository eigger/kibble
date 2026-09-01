/** Phase 1 KST day key — mirrors apps/api/src/lib/kstClock.ts (§7.11) */
const OFFSET_MINUTES = 9 * 60;

export function kstDayKey(base: Date): string {
  const shifted = new Date(base.getTime() + OFFSET_MINUTES * 60_000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const date = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
}

export function distinctKstDaysFromEvents(occurredAtList: string[]): number {
  return new Set(occurredAtList.map((iso) => kstDayKey(new Date(iso)))).size;
}
