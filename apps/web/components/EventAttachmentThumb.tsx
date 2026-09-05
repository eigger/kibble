"use client";

import { useEffect, useRef, useState } from "react";
import {
  canUseDirectAttachmentUrl,
  directAttachmentUrl,
  fetchAttachmentBlob,
} from "../lib/eventAttachments";
import { startLightboxPlayback } from "../lib/lightboxVideo";

type Props = {
  path: string;
  mime: string;
  alt: string;
  className?: string;
  controls?: boolean;
  /** 영상 대표 프레임. 목록에서는 이것만 받는다 */
  posterPath?: string | null;
};

export function EventAttachmentThumb({
  path,
  mime,
  alt,
  className,
  controls = false,
  posterPath,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isVideo = mime.startsWith("video/");
  // 목록·썸네일에 <video>를 걸면 브라우저가 영상 전송을 열고 버퍼링한다(cross-origin
  // 폴백에서는 아예 통째로 받는다). 포스터가 있으면 사진 한 장만 받고 끝낸다.
  // 재생(controls)일 때만 진짜 영상을 가리킨다.
  const usePoster = isVideo && !controls && Boolean(posterPath);
  const sourcePath = usePoster && posterPath ? posterPath : path;
  const renderVideo = isVideo && !usePoster;
  const useDirect = canUseDirectAttachmentUrl();
  // same-origin이면 첫 페인트에 src를 둔다. useEffect 뒤에 붙이면 라이트박스
  // <video>가 클릭 제스처 밖에서 마운트되어 autoplay가 막힌다.
  const [src, setSrc] = useState<string | null>(() =>
    useDirect ? directAttachmentUrl(sourcePath) : null,
  );
  const [autoplayMuted, setAutoplayMuted] = useState(false);

  useEffect(() => {
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
  }, [sourcePath, useDirect]);

  useEffect(() => {
    setAutoplayMuted(false);
  }, [src]);

  useEffect(() => {
    if (!controls || !src) return;
    const el = videoRef.current;
    if (!el) return;
    let cancelled = false;

    const kick = () => {
      if (cancelled) return;
      void startLightboxPlayback(el).then((result) => {
        if (!cancelled && result === "muted") setAutoplayMuted(true);
      });
    };

    if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) kick();
    else el.addEventListener("loadeddata", kick, { once: true });
    return () => {
      cancelled = true;
      el.removeEventListener("loadeddata", kick);
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
