"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { EventAttachment } from "../lib/types";
import { EventAttachmentThumb } from "./EventAttachmentThumb";
import { stepIndex, swipeDirection } from "../lib/lightboxSwipe";
import { shouldIgnoreArrowKey } from "../lib/lightboxKeys";
import {
  clampScale,
  clampTranslate,
  distance,
  DOUBLE_TAP_SCALE,
  isZoomed,
  midpoint,
  normalize,
  scaleFromWheel,
  ZOOM_IDENTITY,
  zoomAbout,
  type ZoomState,
} from "../lib/zoomPan";

/** 라이트박스가 보여 줄 첨부 묶음(한 이벤트의 첨부)과 현재 위치 */
export type LightboxTarget = { items: EventAttachment[]; index: number };

type Props = {
  items: EventAttachment[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  closeLabel: string;
  /** 대화상자 이름. 없으면 closeLabel을 쓴다 */
  dialogLabel?: string;
  resetLabel?: string;
  prevLabel?: string;
  nextLabel?: string;
};

type Point = { x: number; y: number };

/** 영상 하단 네이티브 컨트롤(탐색 바)과 겹치는 높이. 여기서 시작한 끌기는 스와이프가 아니다. */
const VIDEO_CONTROLS_HEIGHT = 64;

export function AttachmentLightbox({
  items,
  index,
  onIndexChange,
  onClose,
  closeLabel,
  dialogLabel,
  resetLabel,
  prevLabel,
  nextLabel,
}: Props) {
  const current = items[index];
  const isVideo = current?.mime.startsWith("video/") ?? false;

  const go = useCallback(
    (dir: -1 | 1) => {
      const next = stepIndex(index, dir, items.length);
      // 영상으로 넘어올 때 새 <video>의 play()가 이 제스처 턴 안에서 나가야
      // iOS가 소리 재생을 허용한다. 썸네일로 열 때와 같은 이유로 flushSync (R86).
      if (next !== null) flushSync(() => onIndexChange(next));
    },
    [index, items.length, onIndexChange],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        // 영상 컨트롤·입력창에서 누른 좌우 키는 그쪽 몫이다
        if (shouldIgnoreArrowKey(e)) return;
        go(e.key === "ArrowLeft" ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, go]);

  // 영상은 확대가 없으니 여기서 직접 스와이프를 본다. 사진은 ZoomableImage가 본다.
  const videoSwipeRef = useRef<Point | null>(null);
  function handleVideoPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // 컨트롤은 래퍼가 아니라 <video> 하단에 있다 — 가로 영상은 래퍼 가운데에 떠 있다.
    const rect = (
      e.currentTarget.querySelector("video") ?? e.currentTarget
    ).getBoundingClientRect();
    const onControls = e.clientY > rect.bottom - VIDEO_CONTROLS_HEIGHT && e.clientY <= rect.bottom;
    videoSwipeRef.current = onControls ? null : { x: e.clientX, y: e.clientY };
  }
  function handleVideoPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const from = videoSwipeRef.current;
    videoSwipeRef.current = null;
    if (!from) return;
    const dir = swipeDirection(e.clientX - from.x, e.clientY - from.y);
    if (dir !== 0) go(dir);
  }

  if (!current) return null;

  return (
    <div
      className="attachment-lightbox-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={dialogLabel ?? closeLabel}
      onClick={onClose}
    >
      <button type="button" className="attachment-lightbox-close" onClick={onClose}>
        {closeLabel}
      </button>
      {items.length > 1 && (
        <span className="attachment-lightbox-counter" aria-live="polite">
          {index + 1} / {items.length}
        </span>
      )}
      <div className="attachment-lightbox-body" onClick={(e) => e.stopPropagation()}>
        {isVideo ? (
          <div
            key={current.id}
            className="attachment-lightbox-swipe"
            onPointerDown={handleVideoPointerDown}
            onPointerUp={handleVideoPointerUp}
            onPointerCancel={() => {
              videoSwipeRef.current = null;
            }}
          >
            <EventAttachmentThumb
              path={current.path}
              mime={current.mime}
              alt=""
              className="attachment-lightbox-media attachment-lightbox-video"
              controls
            />
          </div>
        ) : (
          <ZoomableImage
            key={current.id}
            path={current.path}
            mime={current.mime}
            resetLabel={resetLabel}
            onSwipe={go}
          />
        )}
      </div>
      {index > 0 && (
        <button
          type="button"
          className="attachment-lightbox-nav attachment-lightbox-prev"
          aria-label={prevLabel}
          onClick={(e) => {
            e.stopPropagation();
            go(-1);
          }}
        >
          ‹
        </button>
      )}
      {index < items.length - 1 && (
        <button
          type="button"
          className="attachment-lightbox-nav attachment-lightbox-next"
          aria-label={nextLabel}
          onClick={(e) => {
            e.stopPropagation();
            go(1);
          }}
        >
          ›
        </button>
      )}
    </div>
  );
}

/**
 * 핀치(터치 2점)·휠(PC)로 확대하고, 확대된 상태에서 끌어 옮긴다.
 * 더블탭/더블클릭으로 확대와 원본을 오간다.
 */
function ZoomableImage({
  path,
  mime,
  resetLabel,
  onSwipe,
}: {
  path: string;
  mime: string;
  resetLabel?: string;
  onSwipe: (dir: -1 | 1) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<ZoomState>(ZOOM_IDENTITY);

  // 진행 중인 포인터들. 1개면 이동, 2개면 핀치.
  const pointersRef = useRef(new Map<number, Point>());
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null);
  const panRef = useRef<{ from: Point; tx: number; ty: number } | null>(null);
  // 1배에서 한 손가락으로 시작한 제스처만 스와이프 후보. 핀치가 끼면 취소한다.
  const swipeRef = useRef<Point | null>(null);
  // 렌더 중에 ref를 쓰지 않는다. 커밋 뒤 동기화하고, 제스처 "시작" 판단에만 쓴다 —
  // 실제 계산은 아래 settle의 함수형 갱신이 항상 최신 prev를 받는다.
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  /** 뷰포트 중심 기준 좌표로 바꾼다 — zoomAbout이 그 좌표계를 쓴다. */
  const toCenterCoords = useCallback((clientX: number, clientY: number): Point => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - (rect.left + rect.width / 2), y: clientY - (rect.top + rect.height / 2) };
  }, []);

  /** 확대본이 화면 밖으로 나가지 않게 가둔 뒤 반영한다. */
  const settle = useCallback((compute: (prev: ZoomState) => ZoomState) => {
    setZoom((prev) => {
      const next = normalize(compute(prev));
      const viewport = viewportRef.current?.getBoundingClientRect();
      const content = contentRef.current?.firstElementChild?.getBoundingClientRect();
      if (!viewport || !content) return next;
      // content는 이미 변형된 크기라 커밋된 배율로 나눠 1배 기준 크기로 되돌린다.
      const base = { width: content.width / prev.scale, height: content.height / prev.scale };
      return clampTranslate(next, viewport, base);
    });
  }, []);

  // React의 onWheel은 passive라 preventDefault가 먹지 않는다 — 직접 붙인다.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = toCenterCoords(e.clientX, e.clientY);
      settle((prev) => zoomAbout(prev, scaleFromWheel(prev.scale, e.deltaY), p.x, p.y));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [toCenterCoords, settle]);

  function handlePointerDown(e: React.PointerEvent) {
    const pointers = pointersRef.current;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);

    if (pointers.size === 2) {
      const [a, b] = Array.from(pointers.values());
      pinchRef.current = { distance: distance(a, b), scale: zoomRef.current.scale };
      panRef.current = null;
      swipeRef.current = null;
    } else if (pointers.size === 1 && !isZoomed(zoomRef.current)) {
      swipeRef.current = { x: e.clientX, y: e.clientY };
    } else if (pointers.size === 1 && isZoomed(zoomRef.current)) {
      panRef.current = {
        from: { x: e.clientX, y: e.clientY },
        tx: zoomRef.current.tx,
        ty: zoomRef.current.ty,
      };
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    const pointers = pointersRef.current;
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size >= 2 && pinchRef.current) {
      const [a, b] = Array.from(pointers.values());
      const spread = distance(a, b);
      if (spread <= 0) return;
      const center = midpoint(a, b);
      const p = toCenterCoords(center.x, center.y);
      const start = pinchRef.current;
      settle((prev) =>
        zoomAbout(prev, clampScale((start.scale * spread) / start.distance), p.x, p.y),
      );
      return;
    }

    const pan = panRef.current;
    if (pan) {
      settle((prev) => ({
        scale: prev.scale,
        tx: pan.tx + (e.clientX - pan.from.x),
        ty: pan.ty + (e.clientY - pan.from.y),
      }));
    }
  }

  function endPointer(e: React.PointerEvent) {
    const pointers = pointersRef.current;
    const swipeFrom = swipeRef.current;
    if (swipeFrom && e.type === "pointerup" && !isZoomed(zoomRef.current)) {
      const dir = swipeDirection(e.clientX - swipeFrom.x, e.clientY - swipeFrom.y);
      if (dir !== 0) onSwipe(dir);
    }
    if (pointers.size <= 1) swipeRef.current = null;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchRef.current = null;
    if (pointers.size === 0) panRef.current = null;
  }

  function handleDoubleClick(e: React.MouseEvent) {
    const p = toCenterCoords(e.clientX, e.clientY);
    settle((prev) =>
      isZoomed(prev) ? ZOOM_IDENTITY : zoomAbout(prev, DOUBLE_TAP_SCALE, p.x, p.y),
    );
  }

  const zoomed = isZoomed(zoom);

  return (
    <div
      ref={viewportRef}
      className="attachment-lightbox-viewport"
      data-zoomed={zoomed ? "true" : "false"}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onDoubleClick={handleDoubleClick}
    >
      <div
        ref={contentRef}
        className="attachment-lightbox-zoom"
        style={{ transform: `translate(${zoom.tx}px, ${zoom.ty}px) scale(${zoom.scale})` }}
      >
        <EventAttachmentThumb path={path} mime={mime} alt="" className="attachment-lightbox-media" />
      </div>
      {zoomed && resetLabel && (
        <button
          type="button"
          className="attachment-lightbox-reset"
          onClick={() => setZoom(ZOOM_IDENTITY)}
        >
          {resetLabel}
        </button>
      )}
    </div>
  );
}
