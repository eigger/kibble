"use client";

import { useEffect } from "react";
import { EventAttachmentThumb } from "./EventAttachmentThumb";

type Props = {
  path: string;
  mime: string;
  onClose: () => void;
  closeLabel: string;
};

export function AttachmentLightbox({ path, mime, onClose, closeLabel }: Props) {
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
          <EventAttachmentThumb
            path={path}
            mime={mime}
            alt=""
            className="attachment-lightbox-media"
          />
        )}
      </div>
    </div>
  );
}
