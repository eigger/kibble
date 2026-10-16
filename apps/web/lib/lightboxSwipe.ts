/** 라이트박스 좌우 스와이프 판정. 제스처 배선은 컴포넌트가 한다. */

/** 이 거리(px) 이상 끌어야 넘김으로 본다 */
export const SWIPE_MIN_DISTANCE = 50;

/**
 * 손가락을 뗀 시점의 이동량으로 넘길 방향을 정한다.
 * 다음 사진 = +1(왼쪽으로 끎), 이전 사진 = -1(오른쪽으로 끎), 넘기지 않으면 0.
 * 세로로 더 많이 움직였으면 스크롤·탭 의도로 보고 무시한다.
 */
export function swipeDirection(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE) return 0;
  if (Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx < 0 ? 1 : -1;
}

/** 끝에서는 멈춘다(순환하지 않는다). 범위를 벗어나면 null. */
export function stepIndex(index: number, dir: -1 | 1, length: number): number | null {
  const next = index + dir;
  return next >= 0 && next < length ? next : null;
}
