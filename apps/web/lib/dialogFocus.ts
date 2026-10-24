/**
 * 다이얼로그 포커스 관리의 순수 로직 (훅 `useDialog`가 쓴다).
 * DOM 탐색과 "다음에 어디로 갈지" 계산을 분리해 컴포넌트 렌더 없이 테스트한다.
 */

export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "audio[controls]",
  "video[controls]",
  "[contenteditable]:not([contenteditable='false'])",
  "[tabindex]",
].join(",");

function isTabbable(el: HTMLElement): boolean {
  if ((el as HTMLButtonElement).disabled) return false;
  if (el instanceof HTMLInputElement && el.type === "hidden") return false;
  // tabindex="-1"은 포커스는 되지만 Tab 순서에는 없다
  const tabindex = el.getAttribute("tabindex");
  if (tabindex !== null && Number(tabindex) < 0) return false;
  if (el.closest("[hidden], [inert], [aria-hidden='true']")) return false;
  return true;
}

/** 컨테이너 안에서 Tab으로 닿을 수 있는 요소를 DOM 순서대로 돌려준다. */
export function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isTabbable);
}

/**
 * Tab 가두기: 현재 위치(`current`, 목록 밖이면 -1)에서 Tab/Shift+Tab을 눌렀을 때
 * 직접 포커스를 옮겨야 하면 그 인덱스를, 브라우저 기본 동작에 맡기면 null을 돌려준다.
 * 목록이 비면 -1 (컨테이너 자체에 머문다).
 */
export function nextTabIndex(count: number, current: number, shift: boolean): number | null {
  if (count === 0) return -1;
  if (current < 0 || current >= count) return shift ? count - 1 : 0;
  if (shift && current === 0) return count - 1;
  if (!shift && current === count - 1) return 0;
  return null;
}

/** 열린 다이얼로그 스택. 중첩(시트 위 라이트박스 등)에서 맨 위 하나만 키를 처리한다. */
export function createDialogStack() {
  const stack: symbol[] = [];
  return {
    push(token: symbol) {
      stack.push(token);
    },
    remove(token: symbol) {
      const i = stack.indexOf(token);
      if (i >= 0) stack.splice(i, 1);
    },
    isTop(token: symbol) {
      return stack.length > 0 && stack[stack.length - 1] === token;
    },
    size() {
      return stack.length;
    },
  };
}

export type KeyLike = {
  key: string;
  shiftKey?: boolean;
  defaultPrevented?: boolean;
  isComposing?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
};

/** Escape가 다이얼로그를 닫아야 하는 입력인가. IME 조합 중·이미 처리된 키는 제외. */
export function isDismissKey(e: KeyLike): boolean {
  return e.key === "Escape" && !e.defaultPrevented && !e.isComposing;
}

/** Tab 가두기가 개입해야 하는 입력인가 (수식키 조합은 브라우저 몫). */
export function isTrapKey(e: KeyLike): boolean {
  return e.key === "Tab" && !e.altKey && !e.ctrlKey && !e.metaKey;
}
