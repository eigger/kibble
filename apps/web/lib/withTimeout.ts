/**
 * `task`가 `ms` 안에 끝나지 않으면 기다리지 않고 넘어간다(결과는 버린다). 오류도 삼킨다 —
 * 로그아웃처럼 "되면 좋고 안 돼도 진행"인 정리에 쓴다. `serviceWorker.ready`는 등록이 없으면
 * 영영 끝나지 않을 수 있다.
 */
export async function bestEffort(task: () => Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      task().catch(() => {}),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms);
      }),
    ]);
  } catch {
    // task()가 동기로 던진 경우
  } finally {
    if (timer) clearTimeout(timer);
  }
}
