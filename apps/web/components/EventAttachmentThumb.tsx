"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  canUseDirectAttachmentUrl,
  directAttachmentUrl,
  fetchAttachmentBlob,
} from "../lib/eventAttachments";
import { startLightboxPlayback } from "../lib/lightboxVideo";
import { holdVideoThumbPlaceholder } from "../lib/attachmentThumb";

type Props = {
  path: string;
  mime: string;
  alt: string;
  className?: string;
  controls?: boolean;
  /** 영상 대표 프레임. 목록에서는 이것만 받는다 */
  posterPath?: string | null;
  transcodeStatus?: string | null;
};

export function EventAttachmentThumb({
  path,
  mime,
  alt,
  className,
  controls = false,
  posterPath,
  transcodeStatus,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isVideo = mime.startsWith("video/");
  // 목록·썸네일에 <video>를 걸면 브라우저가 영상 전송을 열고 버퍼링한다(cross-origin
  // 폴백에서는 아예 통째로 받는다). 포스터가 있으면 사진 한 장만 받고 끝낸다.
  // 재생(controls)일 때만 진짜 영상을 가리킨다.
  const awaitingPoster = holdVideoThumbPlaceholder({
    mime,
    controls,
    posterPath,
    transcodeStatus,
  });
  const usePoster = isVideo && !controls && Boolean(posterPath);
  const sourcePath = usePoster && posterPath ? posterPath : path;
  const renderVideo = isVideo && !usePoster && !awaitingPoster;
  // 서버(window 없음)는 false, 클라 same-origin은 true → 렌더 중 호출하면
  // SSR은 placeholder <span>, 클라 첫 페인트는 <video>/<img>가 되어 hydration이
  // 그 서브트리를 버린다. 지금은 목록·상세가 클라 fetch라 SSR 시점에 첨부가
  // 안 그려져 안전하다. 서버 데이터로 첨부를 그리게 되면 이 호출을 렌더 밖으로.
  const useDirect = canUseDirectAttachmentUrl();
  // same-origin이면 첫 페인트에 src를 둔다. useEffect 뒤에 붙이면 라이트박스
  // <video>가 클릭 제스처 밖에서 마운트되어 autoplay가 막힌다. 부수 효과로
  // 목록 썸네일의 placeholder 깜빡임도 없다.
  const [src, setSrc] = useState<string | null>(() =>
    awaitingPoster ? null : useDirect ? directAttachmentUrl(sourcePath) : null,
  );
  const [autoplayMuted, setAutoplayMuted] = useState(false);

  useEffect(() => {
    if (awaitingPoster) {
      setSrc(null);
      return;
    }
    if (useDirect) {
      setSrc(directAttachmentUrl(sourcePath));
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const blob = await fetchAttachmentBlob(sourcePath);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch {
        if (!cancelled) setSrc(null);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [sourcePath, useDirect, awaitingPoster]);

  useEffect(() => {
    setAutoplayMuted(false);
  }, [src]);

  // loadeddata를 기다리면 play()가 네트워크 왕복 뒤로 밀려 탭 제스처가 끝난다 (R86).
  // useLayoutEffect: flushSync 커밋과 같은 턴에서 호출해 활성화 창 안에 남긴다.
  useLayoutEffect(() => {
    if (!controls || !src) return;
    const el = videoRef.current;
    if (!el) return;
    let cancelled = false;
    void startLightboxPlayback(el).then((result) => {
      if (!cancelled && result === "muted") setAutoplayMuted(true);
    });
    return () => {
      cancelled = true;
    };
  }, [controls, src]);

  if (!src) {
    return (
      <span
        className={`attachment-thumb attachment-thumb-placeholder${className ? ` ${className}` : ""}`}
        aria-hidden
      />
    );
  }

  if (renderVideo) {
    return (
      <video
        ref={videoRef}
        src={src}
        className={controls ? className : `${className ?? ""} attachment-thumb-inert`.trim()}
        muted={!controls || autoplayMuted}
        controls={controls}
        autoPlay={controls}
        playsInline
        // iOS 홈화면 PWA는 playsinline이 없으면 전체화면으로 가로채 자동재생이 실패한다.
        {...{ "webkit-playsinline": "true" }}
        preload={controls ? "auto" : "metadata"}
        tabIndex={controls ? undefined : -1}
        disablePictureInPicture
        aria-label={alt}
      />
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} />;
}
