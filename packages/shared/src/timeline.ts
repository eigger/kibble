export const TIMELINE_PAGE_SIZE = 30;

/** 홈 첫 페이지·추가 로드가 같은 페이지 크기를 쓴다. */
export function timelineHasMore(pageLength: number, pageSize = TIMELINE_PAGE_SIZE): boolean {
  return pageLength >= pageSize;
}

/** 타임라인 무한 스크롤 — 중복 id 제거 후 기존 목록 뒤에 붙인다. */
export function appendTimelinePage<T extends { id: string }>(
  existing: T[],
  page: T[],
): { events: T[]; appended: number } {
  if (page.length === 0) return { events: existing, appended: 0 };
  const seen = new Set(existing.map((e) => e.id));
  const newItems = page.filter((e) => !seen.has(e.id));
  if (newItems.length === 0) return { events: existing, appended: 0 };
  return { events: [...existing, ...newItems], appended: newItems.length };
}

/** occurredAt desc · id desc 순서로 한 행을 다시 끼운다 (복구용). */
export function insertTimelineEvent<T extends { id: string; occurredAt: string }>(
  events: T[],
  item: T,
): T[] {
  const without = events.filter((e) => e.id !== item.id);
  const merged = [...without, item];
  merged.sort((a, b) => {
    const diff = new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
    if (diff !== 0) return diff;
    return b.id.localeCompare(a.id);
  });
  return merged;
}
