"use client";

import { useEffect, useState } from "react";
import { fetchAttachmentBlob } from "../lib/eventAttachments";

type Props = {
  path: string;
  mime: string;
  alt: string;
  className?: string;
};

export function EventAttachmentThumb({ path, mime, alt, className }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const isVideo = mime.startsWith("video/");

  useEffect(() => {
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
  }, [path]);

  if (!src) {
    return <span className={`attachment-thumb attachment-thumb-placeholder${className ? ` ${className}` : ""}`} aria-hidden />;
  }

  if (isVideo) {
    return (
      <video
        src={src}
        className={className}
        muted
        playsInline
        preload="metadata"
        aria-label={alt}
      />
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} />;
}
