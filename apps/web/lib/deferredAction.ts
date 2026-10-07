export interface DeferredAction {
  /** 지금 실행한다 — 이미 실행·취소됐으면 아무 일도 없다 */
  flush(): void;
  /** 실행하지 않고 거둔다 */
  cancel(): void;
}

/**
 * `delayMs` 뒤에 `run`을 **정확히 한 번** 실행한다. `flush`로 앞당기거나 `cancel`로 거둘 수 있고,
 * 어느 쪽이든 한 번 끝나면 다시 일어나지 않는다. 실행취소 토스트가 닫힐 때까지 "되돌릴 수 없는
 * 정리"(업로드 취소 등)를 미루는 데 쓴다 — 토스트는 만료 콜백이 없어 시간으로 맞춘다.
 */
export function deferOnce(
  run: () => void,
  /** null이면 타이머 없이 `flush`/`cancel`로만 끝난다 — 토스트 수명 같은 외부 신호에 맞출 때 */
  delayMs: number | null,
  timers: {
    set: (fn: () => void, ms: number) => unknown;
    clear: (handle: unknown) => void;
  } = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  },
): DeferredAction {
  let done = false;
  const handle = delayMs == null ? null : timers.set(() => finish(true), delayMs);

  function finish(shouldRun: boolean) {
    if (done) return;
    done = true;
    if (handle != null) timers.clear(handle);
    if (shouldRun) run();
  }

  return { flush: () => finish(true), cancel: () => finish(false) };
}
