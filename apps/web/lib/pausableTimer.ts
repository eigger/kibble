export interface PausableTimer {
  /** 남은 시간을 멈춘다 — 이미 멈췄거나 끝났으면 아무 일도 없다 */
  pause(): void;
  /** 남은 시간부터 이어 간다 */
  resume(): void;
  /** 만료 없이 거둔다 */
  cancel(): void;
}

export interface TimerEnv {
  now: () => number;
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

const realEnv: TimerEnv = {
  now: () => Date.now(),
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * `ms` 뒤에 `onExpire`를 **한 번만** 부른다. `pause`/`resume`으로 남은 시간을 보존한다 —
 * 실행취소 토스트가 호버·키보드 포커스 중에는 사라지지 않게 한다(WCAG 2.2.1 시간 조절).
 */
export function createPausableTimer(
  ms: number,
  onExpire: () => void,
  env: TimerEnv = realEnv,
): PausableTimer {
  let remaining = ms;
  let startedAt = env.now();
  let handle: unknown = null;
  let done = false;

  function start() {
    startedAt = env.now();
    handle = env.set(() => {
      if (done) return;
      done = true;
      handle = null;
      onExpire();
    }, remaining);
  }
  start();

  return {
    pause() {
      if (done || handle == null) return;
      env.clear(handle);
      handle = null;
      remaining = Math.max(0, remaining - (env.now() - startedAt));
    },
    resume() {
      if (done || handle != null) return;
      start();
    },
    cancel() {
      if (done) return;
      done = true;
      if (handle != null) env.clear(handle);
      handle = null;
    },
  };
}
