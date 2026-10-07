"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { createToastLifecycle } from "./toastLifecycle";

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

  // 타이머·멈춤·닫힘 규칙은 순수 로직(toastLifecycle)에 있다
  const [lifecycle] = useState(() =>
    createToastLifecycle((id) => setToasts((prev) => prev.filter((t) => t.id !== id))),
  );

  const show = useCallback(
    (message: string, kind: Toast["kind"] = "info", action?: ToastAction, options?: ToastOptions) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, message, kind, action }]);
      // 실행취소 토스트 — P1-21: 3초. 액션이 있으면 호버·포커스 중에는 멈춘다
      lifecycle.open(id, action ? 3000 : 2500, options?.onClose);
    },
    [lifecycle],
  );

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {/* 항상 DOM에 있는 라이브 영역 — 토스트마다 새로 만든 role="status"는 스크린리더가 첫 내용을
          읽지 않는 일이 많다. 오류만 개별 role="alert"(명시적 aria-live와 같이 쓰지 않는다) */}
      <div className="toast-stack" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.kind}`}
            role={t.kind === "error" ? "alert" : undefined}
            onMouseEnter={t.action ? () => lifecycle.hold(t.id, "hover") : undefined}
            onMouseLeave={t.action ? () => lifecycle.release(t.id, "hover") : undefined}
            onFocus={t.action ? () => lifecycle.hold(t.id, "focus") : undefined}
            onBlur={t.action ? () => lifecycle.release(t.id, "focus") : undefined}
          >
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => lifecycle.press(t.id, () => t.action?.onClick())}
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
