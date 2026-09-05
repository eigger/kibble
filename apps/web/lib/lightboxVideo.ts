/**
 * 라이트박스 <video>를 재생한다.
 *
 * 썸네일 클릭으로 열어도 React가 커밋한 뒤에는 브라우저가 그 클릭을
 * 제스처로 안 볼 수 있다. 소리 재생이 막히면 무음으로라도 시작해서
 * 재생 버튼을 한 번 더 누르지 않게 한다. 소리는 네이티브 컨트롤로 켠다.
 */
export async function startLightboxPlayback(
  el: Pick<HTMLVideoElement, "play" | "muted">,
): Promise<"playing" | "muted" | "blocked"> {
  try {
    await el.play();
    return el.muted ? "muted" : "playing";
  } catch {
    el.muted = true;
    try {
      await el.play();
      return "muted";
    } catch {
      return "blocked";
    }
  }
}
