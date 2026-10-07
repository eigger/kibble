/** /q 반려동물 탭의 ARIA 연결용 id — 탭이 제어하는 두 영역(타임라인·입력 바)을 가리킨다. */
export function quickPetTabId(petId: string): string {
  return `quick-pet-tab-${petId}`;
}

export function quickPetPanelIds(petId: string): { timeline: string; input: string } {
  return { timeline: `quick-pet-panel-${petId}`, input: `quick-pet-input-${petId}` };
}

/**
 * `aria-controls` 값 — **모든 탭이 지금 렌더된 패널(현재 반려동물 것)** 을 가리킨다. 패널은 선택된
 * 아이 것 하나뿐이라 탭마다 자기 id를 가리키면 DOM에 없는 id가 된다(axe aria-valid-attr-value).
 * 로딩·오류로 현재 아이가 없으면 패널도 없으므로 생략한다. 입력 바가 없으면(읽기 전용 VIEWER) 타임라인만.
 */
export function quickPetControls(
  currentPetId: string | null | undefined,
  hasInputBar: boolean,
): string | undefined {
  if (!currentPetId) return undefined;
  const ids = quickPetPanelIds(currentPetId);
  return hasInputBar ? `${ids.timeline} ${ids.input}` : ids.timeline;
}
