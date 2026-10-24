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

/** display:none 조상이나 visibility:hidden이면 포커스를 받을 수 없다. 레이아웃이 없는 jsdom에서도 동작한다. */
function isRendered(el: HTMLElement): boolean {
  if (typeof el.checkVisibility === "function") {
    return el.checkVisibility({ visibilityProperty: true });
  }
  const view = el.ownerDocument.defaultView;
  if (!view) return true;
  if (view.getComputedStyle(el).visibility !== "visible") return false;
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    if (view.getComputedStyle(node).display === "none") return false;
  }
  return true;
}

function isTabbable(el: HTMLElement): boolean {
  if (el.matches(":disabled")) return false;
  if (!isRendered(el)) return false;
  if (el instanceof HTMLInputElement && el.type === "hidden") return false;
  // tabindex="-1"은 포커스는 되지만 Tab 순서에는 없다
  const tabindex = el.getAttribute("tabindex");
  if (tabindex !== null && Number(tabindex) < 0) return false;
  if (el.closest("[hidden], [inert], [aria-hidden='true']")) return false;
  return true;
}

/** 컨테이너 안에서 Tab으로 닿을 수 있는 요소를 DOM 순서대로 돌려준다. */
export function getFocusable(container: HTMLElement): HTMLElement[] {
  const tabbable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isTabbable);
  return collapseRadioGroups(tabbable);
}

function isNamedRadio(el: Element): el is HTMLInputElement {
  return el instanceof HTMLInputElement && el.type === "radio" && el.name !== "";
}

/** 라디오 그룹은 폼(null=폼 밖)과 name으로 구분한다. */
function radioGroups(list: HTMLElement[]): Map<HTMLFormElement | null, Map<string, HTMLInputElement>> {
  const groups = new Map<HTMLFormElement | null, Map<string, HTMLInputElement>>();
  for (const el of list) {
    if (!isNamedRadio(el)) continue;
    let byName = groups.get(el.form);
    if (!byName) groups.set(el.form, (byName = new Map()));
    const current = byName.get(el.name);
    if (!current || (el.checked && !current.checked)) byName.set(el.name, el);
  }
  return groups;
}

/** 같은 그룹의 라디오는 Tab으로 한 칸이다 — 선택된 것, 없으면 첫 번째만 남긴다. */
function collapseRadioGroups(list: HTMLElement[]): HTMLElement[] {
  const groups = radioGroups(list);
  return list.filter((el) => !isNamedRadio(el) || groups.get(el.form)?.get(el.name) === el);
}

/**
 * `getFocusable` 결과 안에서 현재 포커스의 위치(없으면 -1).
 * 라디오는 방향키로 그룹 안의 다른 항목에 있을 수 있어 그룹 대표의 위치로 본다.
 */
export function focusIndexOf(list: HTMLElement[], active: Element | null): number {
  if (!active) return -1;
  const direct = list.findIndex((el) => el === active);
  if (direct >= 0 || !isNamedRadio(active)) return direct;
  return list.findIndex((el) => isNamedRadio(el) && el.form === active.form && el.name === active.name);
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

/**
 * 닫을 때 포커스를 돌려줄 "열기 직전 요소"로 쓸 수 있는가.
 * body/documentElement(= 포커스 없음)나 다이얼로그 자신 안의 요소는 아니다.
 */
export function restorableOpener(active: Element | null, container: HTMLElement | null): HTMLElement | null {
  if (!(active instanceof HTMLElement)) return null;
  if (active === active.ownerDocument.body || active === active.ownerDocument.documentElement) return null;
  if (container?.contains(active)) return null;
  return active;
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
    top(): symbol | undefined {
      return stack[stack.length - 1];
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
