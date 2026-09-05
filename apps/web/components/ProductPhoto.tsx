"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

type Props = {
  productId: string;
  /** 대표 사진을 그릴 때. photoId가 있으면 무시된다 */
  photoPath?: string | null;
  /** 특정 사진 한 장을 그릴 때 */
  photoId?: string | null;
  alt: string;
  className?: string;
};

export function ProductPhoto({ productId, photoPath, photoId, alt, className }: Props) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!photoId && !photoPath) {
      setSrc(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    void (async () => {
      const url = photoId
        ? `/api/products/${productId}/photos/${photoId}`
        : `/api/products/${productId}/photo`;
      const res = await apiFetch(url);
      if (!res.ok || cancelled) return;
      const blob = await res.blob();
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      if (!cancelled) setSrc(objectUrl);
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [productId, photoPath, photoId]);

  if (!src) return null;
  // Blob URL from authenticated fetch — next/image cannot load this source.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} />;
}
