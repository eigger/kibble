"use client";

import { useEffect, useMemo, useRef } from "react";
import type { AttachmentUploadProgress } from "../lib/eventAttachments";
import { normalizeAttachmentType, snapshotFile } from "../lib/uploadPrep";

const MAX_FILES = 9;

// MIME을 하나하나 나열하면 안드로이드 갤러리에서 HEIF·webm 같은 항목이 통째로 회색이
// 된다. 넓게 열어두고 형식 판단은 uploadPrep + 서버에 맡긴다 (K-12).
//
// iOS는 accept에 image/heic이 있으면 원본 HEIC을 확실히 넘긴다. 반대로 image/*면 JPEG로
// 바꿔 주는 버전이 많지만 **보장되지는 않는다** — HEIC 대응의 실제 담보는 accept가 아니라
// uploadPrep의 canvas 변환이다. 여기서는 나열의 부작용만 피한다.
const GALLERY_ACCEPT = "image/*,video/*";

type Props = {
  files: File[];
  existingCount?: number;
  disabled?: boolean;
  onChange: (files: File[]) => void;
  progress?: AttachmentUploadProgress | null;
  t: (key: string, params?: Record<string, string>) => string;
};

function progressLabel(
  progress: { phase: AttachmentUploadProgress["phase"]; loaded: number; total: number },
  t: (key: string, params?: Record<string, string>) => string,
): string {
  if (progress.phase === "preparing" || progress.total <= 0) return t("attachmentPreparing");
  return `${Math.min(100, Math.round((progress.loaded / progress.total) * 100))}%`;
}

function progressRatio(progress: { phase: AttachmentUploadProgress["phase"]; loaded: number; total: number }): number {
  if (progress.phase === "preparing" || progress.total <= 0) return 0;
  return Math.min(1, progress.loaded / progress.total);
}

export function PendingAttachments({
  files,
  existingCount = 0,
  disabled,
  onChange,
  progress,
  t,
}: Props) {
  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);
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
    const picked = Array.from(list);
    const room = MAX_FILES - existingCount - files.length;
    if (room <= 0) return;
    const incoming = picked.slice(0, room);
    const appended = [...files, ...incoming];
    // 썸네일은 즉시 그린다. 바이트 복사는 백그라운드 — 복사가 끝날 때까지
    // onChange를 미루면 앨범을 닫은 뒤 화면이 멈춘 것처럼 보인다.
    filesRef.current = appended;
    onChange(appended);
    void Promise.all(incoming.map((file) => snapshotFile(file).catch(() => file))).then((snapped) => {
      const current = filesRef.current;
      let changed = false;
      const next = current.map((file) => {
        const i = incoming.indexOf(file);
        if (i === -1 || snapped[i] === file) return file;
        changed = true;
        return snapped[i];
      });
      if (changed) {
        filesRef.current = next;
        onChange(next);
      }
    });
  }

  function removeAt(index: number) {
    const next = files.filter((_, i) => i !== index);
    filesRef.current = next;
    onChange(next);
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
      {progress && files.length > 0 && (
        <p className="meta pending-attachments-status" aria-live="polite">
          {t("attachmentUploading", {
            current: String(progress.startedCount),
            total: String(progress.fileCount),
          })}
        </p>
      )}
      {files.length > 0 && (
        <ul className="pending-attachments-list" aria-label={t("pendingAttachmentsLabel")}>
          {files.map((file, index) => {
            const url = previewUrls[index];
            if (!url) return null;
            // 안드로이드 파일 제공자는 type이 빈 File을 준다 — 그대로 보면 영상도
            // <img>로 그려 미리보기가 깨진다. 업로드 경로와 같은 기준을 쓴다.
            const isVideo = normalizeAttachmentType(file).startsWith("video/");
            const fileState = progress?.fileStates[index];
            const fileProgress = fileState?.active ? fileState : null;
            const done = fileState?.done === true;
            return (
              <li key={`${index}-${file.name}-${file.lastModified}`} className="pending-attachments-item">
                {isVideo ? (
                  <video
                    src={url}
                    className="attachment-thumb attachment-thumb-inert"
                    muted
                    playsInline
                    preload="metadata"
                    tabIndex={-1}
                    disablePictureInPicture
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt="" className="attachment-thumb" />
                )}
                {/* 네이티브 video 레이어가 × 버튼 터치를 가로채지 않게 덮는다 */}
                <span className="attachment-thumb-hit" aria-hidden />
                {isVideo && <span className="attachment-video-badge" aria-hidden />}
                {fileProgress && (
                  <span className="attachment-progress-overlay">
                    <span className="attachment-progress-label">{progressLabel(fileProgress, t)}</span>
                    <span className="attachment-progress-track">
                      <span
                        className="attachment-progress-fill"
                        style={{ width: `${progressRatio(fileProgress) * 100}%` }}
                      />
                    </span>
                  </span>
                )}
                {done && (
                  <span className="attachment-progress-overlay attachment-progress-done" aria-hidden>
                    ✓
                  </span>
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
