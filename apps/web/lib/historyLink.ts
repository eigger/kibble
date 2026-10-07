/** 이력 화면으로 — 그 반려동물의 그 기록을 바로 열도록 `pet`·`highlight`를 싣는다 (history/page.tsx가 읽는다). */
export function historyEventHref(petId: string | null | undefined, eventId: string): string {
  const params = new URLSearchParams();
  if (petId) params.set("pet", petId);
  params.set("highlight", eventId);
  return `/history?${params.toString()}`;
}
