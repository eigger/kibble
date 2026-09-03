"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EventAttachmentThumb } from "./EventAttachmentThumb";
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

type Props = {
  path: string;
  mime: string;
  onClose: () => void;
  closeLabel: string;
  resetLabel?: string;
};

type Point = { x: number; y: number };

export function AttachmentLightbox({ path, mime, onClose, closeLabel, resetLabel }: Props) {
  const isVideo = mime.startsWith("video/");

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="attachment-lightbox-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={closeLabel}
      onClick={onClose}
    >
      <button type="button" className="attachment-lightbox-close" onClick={onClose}>
        {closeLabel}
      </button>
      <div className="attachment-lightbox-body" onClick={(e) => e.stopPropagation()}>
        {isVideo ? (
          <EventAttachmentThumb
            path={path}
            mime={mime}
            alt=""
            className="attachment-lightbox-media attachment-lightbox-video"
            controls
          />
        ) : (
          <ZoomableImage path={path} mime={mime} resetLabel={resetLabel} />
        )}
      </div>
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
}: {
  path: string;
  mime: string;
  resetLabel?: string;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<ZoomState>(ZOOM_IDENTITY);

  // 진행 중인 포인터들. 1개면 이동, 2개면 핀치.
  const pointersRef = useRef(new Map<number, Point>());
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null);
  const panRef = useRef<{ from: Point; tx: number; ty: number } | null>(null);
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
