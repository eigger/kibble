"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

type Props = {
  petId: string;
  photoPath: string | null | undefined;
  alt: string;
  className?: string;
};

export function PetPhoto({ petId, photoPath, alt, className }: Props) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!photoPath) {
      setSrc(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    void (async () => {
      const res = await apiFetch(`/api/pets/${petId}/photo`);
      if (!res.ok || cancelled) return;
      const blob = await res.blob();
      objectUrl = URL.createObjectURL(blob);
      if (!cancelled) setSrc(objectUrl);
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [petId, photoPath]);

  if (!src) return null;
  // Blob URL from authenticated fetch — next/image cannot load this source.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} />;
}
