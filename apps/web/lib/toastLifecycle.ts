import { createPausableTimer, type PausableTimer, type TimerEnv } from "./pausableTimer";

interface Entry {
  timer: PausableTimer;
  /** 멈춤 사유 — 호버와 포커스가 겹칠 수 있어, 전부 풀려야 이어 간다 */
  holds: Set<string>;
  onClose?: () => void;
}

/**
 * 토스트 하나하나의 수명 — 타이머, 호버·포커스 멈춤, 닫힘을 한곳에서 정한다(화면 없이 테스트한다).
 *
 * 보장: (1) 닫힘 처리(`onRemove`·`onClose`)는 토스트당 정확히 한 번. (2) 액션을 누르면
 * `onClick`이 `onClose`보다 먼저 — 실행취소가 유예 정리를 먼저 거두고 닫힘이 정리를 부른다.
 * (3) 호버·포커스 중 하나라도 남아 있으면 타이머는 멈춘 채다.
 */
export function createToastLifecycle(onRemove: (id: number) => void, env?: TimerEnv) {
  const entries = new Map<number, Entry>();

  function close(id: number) {
    const entry = entries.get(id);
    if (!entry) return;
    entries.delete(id);
    entry.timer.cancel();
    onRemove(id);
    entry.onClose?.();
  }

  return {
    open(id: number, ms: number, onClose?: () => void) {
      entries.set(id, {
        timer: createPausableTimer(ms, () => close(id), env),
        holds: new Set(),
        onClose,
      });
    },
    close,
    /** 액션 버튼 — onClick 다음에 닫는다 */
    press(id: number, onClick: () => void) {
      if (!entries.has(id)) return;
      onClick();
      close(id);
    },
    hold(id: number, source: "hover" | "focus") {
      const entry = entries.get(id);
      if (!entry) return;
      const wasEmpty = entry.holds.size === 0;
      entry.holds.add(source);
      if (wasEmpty) entry.timer.pause();
    },
    release(id: number, source: "hover" | "focus") {
      const entry = entries.get(id);
      if (!entry) return;
      entry.holds.delete(source);
      if (entry.holds.size === 0) entry.timer.resume();
    },
  };
}
