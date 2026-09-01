"use client";

/** 청크 업로드 재개용 — uploadId·eventId만 localStorage에 남긴다 (drop 이식). */
export interface PendingUpload {
  uploadId: string;
  eventId: string;
  filename: string;
  size: number;
  mimeType: string;
  updatedAt: number;
}

const STORAGE_KEY = "kibble_pending_uploads";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function readAll(): PendingUpload[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingUpload[];
    const now = Date.now();
    const fresh = parsed.filter((p) => now - p.updatedAt < MAX_AGE_MS);
    if (fresh.length !== parsed.length) writeAll(fresh);
    return fresh;
  } catch {
    return [];
  }
}

function writeAll(entries: PendingUpload[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function getPendingUploads(): PendingUpload[] {
  return readAll();
}

export function savePendingUpload(entry: Omit<PendingUpload, "updatedAt">): void {
  const all = readAll().filter((p) => p.uploadId !== entry.uploadId);
  all.push({ ...entry, updatedAt: Date.now() });
  writeAll(all);
}

export function removePendingUpload(uploadId: string): void {
  writeAll(readAll().filter((p) => p.uploadId !== uploadId));
}

export function findPendingUploadFor(eventId: string, file: File): PendingUpload | undefined {
  return readAll().find(
    (p) => p.eventId === eventId && p.filename === file.name && p.size === file.size,
  );
}
