/** 라이트박스 확대·이동의 순수 계산. 제스처 배선은 컴포넌트가 한다. */

export type ZoomState = {
  scale: number;
  /** 뷰포트 중심 기준 이동량(px) */
  tx: number;
  ty: number;
};

export const ZOOM_IDENTITY: ZoomState = { scale: 1, tx: 0, ty: 0 };
export const MIN_SCALE = 1;
export const MAX_SCALE = 6;
/** 더블탭·더블클릭으로 오가는 배율 */
export const DOUBLE_TAP_SCALE = 2.5;

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return MIN_SCALE;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/**
 * `px`,`py`(뷰포트 중심 기준 좌표) 아래의 지점을 붙잡은 채 배율만 바꾼다 —
 * 손가락·커서가 짚은 곳이 그대로 있어야 확대가 자연스럽다.
 */
export function zoomAbout(state: ZoomState, nextScale: number, px: number, py: number): ZoomState {
  const scale = clampScale(nextScale);
  if (scale === state.scale) return state;
  const ratio = scale / state.scale;
  return {
    scale,
    tx: px - ratio * (px - state.tx),
    ty: py - ratio * (py - state.ty),
  };
}

/**
 * 확대된 내용이 뷰포트 밖으로 빠져나가지 않게 이동량을 가둔다.
 * 확대본이 뷰포트보다 작은 축은 가운데 고정(0).
 */
export function clampTranslate(
  state: ZoomState,
  viewport: { width: number; height: number },
  content: { width: number; height: number },
): ZoomState {
  const maxX = Math.max(0, (content.width * state.scale - viewport.width) / 2);
  const maxY = Math.max(0, (content.height * state.scale - viewport.height) / 2);
  // `|| 0`은 -0을 0으로 접는다 — 가운데 고정인데 부호만 다른 값이 나오지 않게.
  return {
    scale: state.scale,
    tx: Math.min(maxX, Math.max(-maxX, state.tx)) || 0,
    ty: Math.min(maxY, Math.max(-maxY, state.ty)) || 0,
  };
}

/** 1배로 돌아오면 이동량도 버린다 — 확대를 풀었는데 그림이 치우쳐 있으면 안 된다. */
export function normalize(state: ZoomState): ZoomState {
  return state.scale <= MIN_SCALE ? ZOOM_IDENTITY : state;
}

export function isZoomed(state: ZoomState): boolean {
  return state.scale > MIN_SCALE;
}

/** 두 포인터 사이 거리 — 핀치 배율의 분모/분자가 된다. */
export function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** 휠 한 칸을 배율로. 아래로 굴리면(deltaY>0) 축소. */
export function scaleFromWheel(currentScale: number, deltaY: number): number {
  return clampScale(currentScale * Math.exp(-deltaY / 300));
}
