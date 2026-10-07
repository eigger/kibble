/**
 * 복원한 기록을 지금 타임라인에 넣어도 되는가. 삭제 뒤 다른 반려동물 탭으로 옮긴 채 실행취소하면
 * 복원된 행은 이전 아이의 것이다 — 지금 화면(다른 아이)에 끼워 넣지 않는다.
 * 서버 응답의 `petId`가 없으면(모름) 넣는다.
 */
export function restoredEventBelongsToView(
  restoredPetId: string | null | undefined,
  currentPetId: string | null | undefined,
): boolean {
  if (!restoredPetId || !currentPetId) return true;
  return restoredPetId === currentPetId;
}
