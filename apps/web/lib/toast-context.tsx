"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { createPausableTimer, type PausableTimer } from "./pausableTimer";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: number;
  message: string;
  kind: "info" | "error" | "success";
  action?: ToastAction;
}

interface ToastOptions {
  /** 토스트가 닫힐 때 한 번 — 시간 만료든 액션을 눌러서든. 실행취소 유예를 토스트 수명에 맞출 때 쓴다 */
  onClose?: () => void;
}

interface ToastContextValue {
  show: (
    message: string,
    kind?: Toast["kind"],
    action?: ToastAction,
    options?: ToastOptions,
  ) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const timers = useRef(new Map<number, { timer: PausableTimer; onClose?: () => void }>());

  /** 닫는 길은 하나 — 타이머·onClose 정리가 정확히 한 번 일어난다 */
  const close = useCallback((id: number) => {
    const entry = timers.current.get(id);
    if (!entry) return;
    timers.current.delete(id);
    entry.timer.cancel();
    setToasts((prev) => prev.filter((t) => t.id !== id));
    entry.onClose?.();
  }, []);

  const show = useCallback(
    (message: string, kind: Toast["kind"] = "info", action?: ToastAction, options?: ToastOptions) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, message, kind, action }]);
      // 실행취소 토스트 — P1-21: 3초. 액션이 있으면 호버·포커스 중에는 멈춘다
      const timer = createPausableTimer(action ? 3000 : 2500, () => close(id));
      timers.current.set(id, { timer, onClose: options?.onClose });
    },
    [close],
  );

  const pause = (id: number) => timers.current.get(id)?.timer.pause();
  const resume = (id: number) => timers.current.get(id)?.timer.resume();

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.kind}`}
            // 오류는 즉시 읽고(alert), 나머지는 하던 말을 끊지 않고 읽는다(status)
            role={t.kind === "error" ? "alert" : "status"}
            aria-live={t.kind === "error" ? "assertive" : "polite"}
            aria-atomic="true"
            onMouseEnter={t.action ? () => pause(t.id) : undefined}
            onMouseLeave={t.action ? () => resume(t.id) : undefined}
            onFocus={t.action ? () => pause(t.id) : undefined}
            onBlur={t.action ? () => resume(t.id) : undefined}
          >
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  t.action?.onClick();
                  close(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
