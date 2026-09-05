/**
 * 라이트박스 <video>를 재생한다.
 *
 * 썸네일 클릭으로 열어도 React가 커밋한 뒤에는 브라우저가 그 클릭을
 * 제스처로 안 볼 수 있다. 소리 재생이 막히면 무음으로라도 시작해서
 * 재생 버튼을 한 번 더 누르지 않게 한다. 소리는 네이티브 컨트롤로 켠다.
 *
 * play()는 readyState 0에서도 호출한다. loadeddata를 기다리면 네트워크
 * 왕복 뒤에야 재생이 나가 탭의 활성화 창이 이미 끝난다 (R86).
 */
export async function startLightboxPlayback(
  el: Pick<HTMLVideoElement, "play" | "muted">,
): Promise<"playing" | "muted" | "blocked"> {
  try {
    await el.play();
    return el.muted ? "muted" : "playing";
  } catch (err) {
    // src 교체·언마운트. 정책 거부가 아니므로 무음으로 다시 치지 않는다.
    if (isAbortError(err)) return "blocked";
    el.muted = true;
    try {
      await el.play();
      return "muted";
    } catch (retryErr) {
      if (isAbortError(retryErr)) return "blocked";
      return "blocked";
    }
  }
}

function isAbortError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "name" in err && err.name === "AbortError";
}
