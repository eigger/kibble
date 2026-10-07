/** /q 반려동물 탭의 ARIA 연결용 id — 탭이 제어하는 두 영역(타임라인·입력 바)을 가리킨다. */
export function quickPetTabId(petId: string): string {
  return `quick-pet-tab-${petId}`;
}

export function quickPetPanelIds(petId: string): { timeline: string; input: string } {
  return { timeline: `quick-pet-panel-${petId}`, input: `quick-pet-input-${petId}` };
}

/** `aria-controls` 값 — 입력 바가 없으면(읽기 전용 VIEWER) 타임라인만. */
export function quickPetControls(petId: string, hasInputBar: boolean): string {
  const ids = quickPetPanelIds(petId);
  return hasInputBar ? `${ids.timeline} ${ids.input}` : ids.timeline;
}
