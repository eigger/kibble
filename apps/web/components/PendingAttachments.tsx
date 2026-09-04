"use client";

import { useEffect, useMemo, useRef } from "react";

const MAX_FILES = 9;

// MIME을 하나하나 나열하면 안드로이드 갤러리에서 HEIF·webm 같은 항목이 통째로 회색이
// 되고, iOS Safari는 accept에 image/heic이 있으면 원본 HEIC을 그대로 넘긴다(빼면 JPEG로
// 변환해 준다). 넓게 열어두고 형식 판단은 uploadPrep + 서버에 맡긴다 (K-12).
const GALLERY_ACCEPT = "image/*,video/*";

type Props = {
  files: File[];
  existingCount?: number;
  disabled?: boolean;
  onChange: (files: File[]) => void;
  t: (key: string, params?: Record<string, string>) => string;
};

export function PendingAttachments({ files, existingCount = 0, disabled, onChange, t }: Props) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const photoCaptureRef = useRef<HTMLInputElement>(null);
  const videoCaptureRef = useRef<HTMLInputElement>(null);
  const previewUrls = useMemo(
    () => files.map((file) => URL.createObjectURL(file)),
    [files],
  );

  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const incoming = Array.from(list);
    const room = MAX_FILES - existingCount - files.length;
    if (room <= 0) return;
    onChange([...files, ...incoming.slice(0, room)]);
  }

  function removeAt(index: number) {
    onChange(files.filter((_, i) => i !== index));
  }

  const atLimit = files.length + existingCount >= MAX_FILES;

  return (
    <div className="pending-attachments">
      <div className="pending-attachments-row">
        <button
          type="button"
          className="pending-attachments-add"
          disabled={disabled || atLimit}
          aria-label={t("attachFromAlbum")}
          onClick={() => galleryRef.current?.click()}
        >
          {t("attachFromAlbum")}
        </button>
        <button
          type="button"
          className="pending-attachments-add"
          disabled={disabled || atLimit}
          aria-label={t("capturePhoto")}
          onClick={() => photoCaptureRef.current?.click()}
        >
          {t("capturePhoto")}
        </button>
        <button
          type="button"
          className="pending-attachments-add"
          disabled={disabled || atLimit}
          aria-label={t("captureVideo")}
          onClick={() => videoCaptureRef.current?.click()}
        >
          {t("captureVideo")}
        </button>
        <input
          ref={galleryRef}
          type="file"
          accept={GALLERY_ACCEPT}
          multiple
          className="sr-only"
          disabled={disabled || atLimit}
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={photoCaptureRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          disabled={disabled || atLimit}
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={videoCaptureRef}
          type="file"
          accept="video/*"
          capture="environment"
          className="sr-only"
          disabled={disabled || atLimit}
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {files.length > 0 && (
          <span className="meta pending-attachments-count">
            {t("pendingAttachmentCount", { count: String(files.length) })}
          </span>
        )}
      </div>
      {files.length > 0 && (
        <ul className="pending-attachments-list" aria-label={t("pendingAttachmentsLabel")}>
          {files.map((file, index) => {
            const url = previewUrls[index];
            if (!url) return null;
            const isVideo = file.type.startsWith("video/");
            return (
              <li key={`${index}-${file.name}-${file.lastModified}`} className="pending-attachments-item">
                {isVideo ? (
                  <video src={url} className="attachment-thumb" muted playsInline preload="metadata" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt="" className="attachment-thumb" />
                )}
                <button
                  type="button"
                  className="attachment-remove-btn"
                  disabled={disabled}
                  aria-label={t("removeAttachment")}
                  onClick={() => removeAt(index)}
                >
                  <span aria-hidden>×</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
