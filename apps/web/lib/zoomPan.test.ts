import { describe, expect, it } from "vitest";
import {
  clampScale,
  clampTranslate,
  distance,
  isZoomed,
  MAX_SCALE,
  MIN_SCALE,
  midpoint,
  normalize,
  scaleFromWheel,
  ZOOM_IDENTITY,
  zoomAbout,
} from "./zoomPan";

describe("clampScale", () => {
  it("범위 밖을 가둔다", () => {
    expect(clampScale(0.2)).toBe(MIN_SCALE);
    expect(clampScale(99)).toBe(MAX_SCALE);
    expect(clampScale(2)).toBe(2);
  });

  it("NaN은 1배로", () => {
    expect(clampScale(Number.NaN)).toBe(MIN_SCALE);
  });
});

describe("zoomAbout", () => {
  // 짚은 지점이 움직이면 확대가 어색하다 — 이 불변식이 핵심이다.
  it("짚은 지점을 화면상 같은 자리에 붙잡아 둔다", () => {
    const px = 100;
    const py = -40;
    const before = { scale: 1, tx: 0, ty: 0 };
    const after = zoomAbout(before, 3, px, py);

    // 화면좌표 = t + scale * 콘텐츠좌표
    const contentBefore = { x: (px - before.tx) / before.scale, y: (py - before.ty) / before.scale };
    const screenAfter = {
      x: after.tx + after.scale * contentBefore.x,
      y: after.ty + after.scale * contentBefore.y,
    };
    expect(screenAfter.x).toBeCloseTo(px, 6);
    expect(screenAfter.y).toBeCloseTo(py, 6);
  });

  it("중심을 짚으면 이동량이 생기지 않는다", () => {
    expect(zoomAbout(ZOOM_IDENTITY, 2, 0, 0)).toEqual({ scale: 2, tx: 0, ty: 0 });
  });

  it("배율이 그대로면 상태를 바꾸지 않는다", () => {
    const state = { scale: 2, tx: 10, ty: 5 };
    expect(zoomAbout(state, 2, 50, 50)).toBe(state);
  });

  it("최대 배율을 넘지 않는다", () => {
    expect(zoomAbout(ZOOM_IDENTITY, 999, 10, 10).scale).toBe(MAX_SCALE);
  });
});

describe("clampTranslate", () => {
  const viewport = { width: 400, height: 300 };
  const content = { width: 400, height: 300 };

  it("확대본이 뷰포트보다 작으면 가운데로 고정한다", () => {
    const out = clampTranslate({ scale: 1, tx: 120, ty: -80 }, viewport, content);
    expect(out).toEqual({ scale: 1, tx: 0, ty: 0 });
  });

  it("2배면 각 축으로 절반만큼 움직일 수 있다", () => {
    const out = clampTranslate({ scale: 2, tx: 9999, ty: -9999 }, viewport, content);
    expect(out.tx).toBe(200);
    expect(out.ty).toBe(-150);
  });

  it("범위 안의 이동량은 그대로 둔다", () => {
    const out = clampTranslate({ scale: 2, tx: 50, ty: -20 }, viewport, content);
    expect(out).toEqual({ scale: 2, tx: 50, ty: -20 });
  });
});

describe("normalize", () => {
  it("1배로 돌아오면 이동량을 버린다", () => {
    expect(normalize({ scale: 1, tx: 40, ty: 20 })).toEqual(ZOOM_IDENTITY);
  });

  it("확대 중이면 그대로 둔다", () => {
    const state = { scale: 2, tx: 40, ty: 20 };
    expect(normalize(state)).toBe(state);
  });
});

describe("scaleFromWheel", () => {
  it("위로 굴리면 확대, 아래로 굴리면 축소", () => {
    expect(scaleFromWheel(2, -100)).toBeGreaterThan(2);
    expect(scaleFromWheel(2, 100)).toBeLessThan(2);
  });

  it("1배 아래로는 내려가지 않는다", () => {
    expect(scaleFromWheel(1, 500)).toBe(MIN_SCALE);
  });
});

describe("distance / midpoint / isZoomed", () => {
  it("두 점 사이 거리", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("두 점의 중간", () => {
    expect(midpoint({ x: 0, y: 0 }, { x: 10, y: 4 })).toEqual({ x: 5, y: 2 });
  });

  it("1배는 확대 상태가 아니다", () => {
    expect(isZoomed(ZOOM_IDENTITY)).toBe(false);
    expect(isZoomed({ scale: 1.2, tx: 0, ty: 0 })).toBe(true);
  });
});
