import { useCallback, useRef } from "react";

const DEFAULT_DELAY_MS = 450;

/** 짧은 탭과 길게 누르기를 구분한다. 길게 누르면 onLongPress만 실행한다. */
export function useLongPress(onTap: () => void, onLongPress: () => void, delayMs = DEFAULT_DELAY_MS) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressedRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback(() => {
    longPressedRef.current = false;
    clearTimer();
    timerRef.current = setTimeout(() => {
      longPressedRef.current = true;
      onLongPress();
    }, delayMs);
  }, [clearTimer, delayMs, onLongPress]);

  const onPointerUp = useCallback(() => {
    clearTimer();
    if (!longPressedRef.current) onTap();
  }, [clearTimer, onTap]);

  const onPointerLeave = useCallback(() => {
    clearTimer();
    longPressedRef.current = false;
  }, [clearTimer]);

  return { onPointerDown, onPointerUp, onPointerLeave };
}
