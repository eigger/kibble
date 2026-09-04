"use client";

import { useEffect, useState } from "react";
import {
  canUseDirectAttachmentUrl,
  directAttachmentUrl,
  fetchAttachmentBlob,
} from "../lib/eventAttachments";

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
  const [src, setSrc] = useState<string | null>(null);
  const isVideo = mime.startsWith("video/");
  // 목록·썸네일에 <video>를 걸면 브라우저가 영상 전송을 열고 버퍼링한다(cross-origin
  // 폴백에서는 아예 통째로 받는다). 포스터가 있으면 사진 한 장만 받고 끝낸다.
  // 재생(controls)일 때만 진짜 영상을 가리킨다.
  const usePoster = isVideo && !controls && Boolean(posterPath);
  const sourcePath = usePoster && posterPath ? posterPath : path;
  const renderVideo = isVideo && !usePoster;
  const useDirect = canUseDirectAttachmentUrl();

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
        src={src}
        className={controls ? className : `${className ?? ""} attachment-thumb-inert`.trim()}
        muted={!controls}
        controls={controls}
        playsInline
        preload="metadata"
        tabIndex={controls ? undefined : -1}
        disablePictureInPicture
        aria-label={alt}
      />
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} />;
}
