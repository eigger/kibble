import { useCallback, useRef } from "react";
import type { MouseEvent, PointerEvent } from "react";

const DEFAULT_DELAY_MS = 450;

/**
 * 롱프레스 감지용 포인터 핸들러 + 클릭 억제.
 * 탭/Enter/Space는 버튼 onClick으로 처리한다 — 포인터만으로 탭을 처리하지 않는다.
 */
export function useLongPress(onLongPress: () => void, delayMs = DEFAULT_DELAY_MS) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressNextClickRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      if (e.button !== 0) return;
      suppressNextClickRef.current = false;
      clearTimer();
      timerRef.current = setTimeout(() => {
        suppressNextClickRef.current = true;
        onLongPress();
      }, delayMs);
    },
    [clearTimer, delayMs, onLongPress],
  );

  const onPointerUp = useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  const onPointerLeave = useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  const wrapClick = useCallback(
    (onClick: () => void) =>
      (e: MouseEvent) => {
        if (suppressNextClickRef.current) {
          suppressNextClickRef.current = false;
          e.preventDefault();
          return;
        }
        onClick();
      },
    [],
  );

  return { onPointerDown, onPointerUp, onPointerLeave, onPointerCancel: onPointerLeave, wrapClick };
}
