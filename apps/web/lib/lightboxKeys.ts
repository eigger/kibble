/**
 * 라이트박스가 window에서 받은 키 입력 중 좌우 화살표를 넘김으로 쓸지 정한다.
 * <video controls>의 탐색(←/→ = 5초 이동)이나 입력창의 커서 이동과 겹치면 양보한다.
 * Escape는 어디서든 닫기이므로 여기서 다루지 않는다.
 */
type KeyEventLike = {
  defaultPrevented: boolean;
  target: EventTarget | null;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
};

const EDITABLE_TAGS = new Set(["VIDEO", "AUDIO", "INPUT", "TEXTAREA", "SELECT"]);

export function shouldIgnoreArrowKey(e: KeyEventLike): boolean {
  if (e.defaultPrevented) return true;
  // 브라우저 뒤로/앞으로(Alt+←/→, Cmd+[ 등)와 겹치는 조합은 넘김이 아니다
  if (e.altKey || e.ctrlKey || e.metaKey) return true;
  const el = e.target as { tagName?: string; isContentEditable?: boolean } | null;
  if (!el || typeof el.tagName !== "string") return false;
  return EDITABLE_TAGS.has(el.tagName.toUpperCase()) || el.isContentEditable === true;
}
