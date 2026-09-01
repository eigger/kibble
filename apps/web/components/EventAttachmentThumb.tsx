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
};

export function EventAttachmentThumb({ path, mime, alt, className, controls = false }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const isVideo = mime.startsWith("video/");
  const useDirect = canUseDirectAttachmentUrl();

  useEffect(() => {
    if (useDirect) {
      setSrc(directAttachmentUrl(path));
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const blob = await fetchAttachmentBlob(path);
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
  }, [path, useDirect]);

  if (!src) {
    return (
      <span
        className={`attachment-thumb attachment-thumb-placeholder${className ? ` ${className}` : ""}`}
        aria-hidden
      />
    );
  }

  if (isVideo) {
    return (
      <video
        src={src}
        className={className}
        muted={!controls}
        controls={controls}
        playsInline
        preload="metadata"
        aria-label={alt}
      />
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} />;
}
