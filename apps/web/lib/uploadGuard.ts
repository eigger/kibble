"use client";

/**
 * 업로드가 도는 동안 탭을 닫거나 페이지를 벗어나려 하면 브라우저 확인창을 띄운다.
 *
 * 큰 파일에서는 이탈이 곧 실패다 — 8MB 청크로 150MB면 왕복 19번이라 모바일에서
 * 몇 분이 걸리는데, 그 사이 뒤로 가기 한 번이면 통째로 날아간다. 서버 세션이 디스크에
 * 남아 재개는 가능해졌지만, 재개하려면 사용자가 **같은 파일을 다시 골라야** 한다.
 * 그냥 막는 편이 낫다.
 *
 * 참고: 브라우저는 `returnValue`에 넣은 문구를 무시하고 자기 문구를 쓴다. 그래서
 * 번역 문자열이 필요 없다. iOS Safari는 beforeunload를 지원하지 않는다 — 거기서는
 * 보호가 없다.
 */

let activeUploads = 0;

function onBeforeUnload(event: BeforeUnloadEvent): void {
  event.preventDefault();
  // 구형 브라우저는 returnValue가 비어 있지 않아야 확인창을 띄운다.
  event.returnValue = "";
}

function attach(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeunload", onBeforeUnload);
}

function detach(): void {
  if (typeof window === "undefined") return;
  window.removeEventListener("beforeunload", onBeforeUnload);
}

/** 업로드 시작. 중첩 호출을 세므로 배치와 개별 파일 양쪽에서 불러도 안전하다. */
export function beginUploadGuard(): void {
  activeUploads += 1;
  if (activeUploads === 1) attach();
}

export function endUploadGuard(): void {
  if (activeUploads === 0) return;
  activeUploads -= 1;
  if (activeUploads === 0) detach();
}

export function isUploadInProgress(): boolean {
  return activeUploads > 0;
}

/** 업로드 하나를 가드로 감싼다. 실패해도 반드시 푼다. */
export async function withUploadGuard<T>(run: () => Promise<T>): Promise<T> {
  beginUploadGuard();
  try {
    return await run();
  } finally {
    endUploadGuard();
  }
}

/** 테스트 전용 — 카운터가 세션을 넘어 새지 않게 한다. */
export function resetUploadGuardForTests(): void {
  activeUploads = 0;
  detach();
}
