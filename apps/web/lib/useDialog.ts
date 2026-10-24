"use client";

import { useEffect, useRef, type RefObject } from "react";
import {
  createDialogStack,
  getFocusable,
  isDismissKey,
  isTrapKey,
  nextTabIndex,
} from "./dialogFocus";

const dialogStack = createDialogStack();
/** 스택 아래 다이얼로그로 포커스를 돌려줄 때 쓴다. */
const containers = new Map<symbol, () => HTMLElement | null>();

type Options = {
  /** 다이얼로그가 화면에 있는가. 늘 마운트돼 있는 컴포넌트는 open 상태를 넘긴다. */
  open?: boolean;
  /** Escape로 닫을 때 부르는 콜백. 저장 중 등 닫으면 안 되는 때는 closeOnEscape=false. */
  onClose: () => void;
  closeOnEscape?: boolean;
  /**
   * 열릴 때 포커스를 줄 곳. ref면 그 요소, "first"면 첫 포커스 가능 요소,
   * "container"면 다이얼로그 자체(텍스트 입력이 많은 시트에서 모바일 키보드가 튀지 않게).
   */
  initialFocus?: RefObject<HTMLElement | null> | "first" | "container";
};

/**
 * 모달 다이얼로그 공용 접근성 훅. 반환한 ref를 `role="dialog"` 요소에 붙인다.
 * - 열릴 때 초기 포커스, 닫힐 때 열기 직전 요소로 복원
 * - Tab 가두기, Escape 닫기 (중첩 시 맨 위 다이얼로그만 반응)
 * 스크롤 잠금·백드롭 클릭은 이 훅의 책임이 아니다.
 */
export function useDialog<T extends HTMLElement = HTMLDivElement>({
  open = true,
  onClose,
  closeOnEscape = true,
  initialFocus = "first",
}: Options): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const onCloseRef = useRef(onClose);
  const escapeRef = useRef(closeOnEscape);
  const initialRef = useRef(initialFocus);
  useEffect(() => {
    onCloseRef.current = onClose;
    escapeRef.current = closeOnEscape;
    initialRef.current = initialFocus;
  });

  useEffect(() => {
    if (!open) return;
    const token = Symbol("dialog");
    const container = ref.current;
    const active = document.activeElement;
    // 이미 다이얼로그 안에 있던 포커스(리렌더로 다시 열린 경우 등)는 복원 대상이 아니다
    const opener =
      active instanceof HTMLElement && !(container && container.contains(active)) ? active : null;
    dialogStack.push(token);
    containers.set(token, () => ref.current);

    if (container) {
      if (!container.hasAttribute("tabindex")) container.setAttribute("tabindex", "-1");
      const want = initialRef.current;
      let target: HTMLElement | null = null;
      if (want === "first") target = getFocusable(container)[0] ?? null;
      else if (want !== "container") target = want.current;
      (target ?? container).focus({ preventScroll: true });
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (!dialogStack.isTop(token)) return;
      if (isDismissKey(e)) {
        if (!escapeRef.current) return;
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (!isTrapKey(e)) return;
      const root = ref.current;
      if (!root) return;
      const list = getFocusable(root);
      const active = document.activeElement;
      const current = active instanceof HTMLElement ? list.indexOf(active) : -1;
      const next = nextTabIndex(list.length, current, e.shiftKey);
      if (next === null) return;
      e.preventDefault();
      (next < 0 ? root : list[next]).focus();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      dialogStack.remove(token);
      containers.delete(token);
      if (opener?.isConnected) {
        opener.focus({ preventScroll: true });
        return;
      }
      // 열기 직전 요소가 사라졌다 — 아래에 다이얼로그가 있으면 거기로, 없으면 main으로
      const below = dialogStack.top();
      const fallback = (below && containers.get(below)?.()) || document.querySelector<HTMLElement>("main");
      if (fallback) {
        if (!fallback.hasAttribute("tabindex")) fallback.setAttribute("tabindex", "-1");
        fallback.focus({ preventScroll: true });
      }
    };
  }, [open]);

  return ref;
}
