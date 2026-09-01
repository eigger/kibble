"use client";

import { useEffect, useRef, useState } from "react";

const MAX_FILES = 9;

type Props = {
  files: File[];
  existingCount?: number;
  disabled?: boolean;
  onChange: (files: File[]) => void;
  t: (key: string, params?: Record<string, string>) => string;
};

export function PendingAttachments({ files, existingCount = 0, disabled, onChange, t }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviewUrls(urls);
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

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
          aria-label={t("attachPhotos")}
          onClick={() => inputRef.current?.click()}
        >
          {t("attachPhotos")}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/mp4,video/quicktime"
          multiple
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
      {previewUrls.length > 0 && (
        <ul className="pending-attachments-list" aria-label={t("pendingAttachmentsLabel")}>
          {previewUrls.map((url, index) => {
            const file = files[index];
            const isVideo = file?.type.startsWith("video/");
            return (
              <li key={`${file.name}-${index}`} className="pending-attachments-item">
                {isVideo ? (
                  <video src={url} className="attachment-thumb" muted playsInline preload="metadata" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt="" className="attachment-thumb" />
                )}
                <button
                  type="button"
                  className="pending-attachments-remove"
                  disabled={disabled}
                  aria-label={t("removeAttachment")}
                  onClick={() => removeAt(index)}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
