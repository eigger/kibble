import { randomUUID } from "node:crypto";
import path from "node:path";
import { unlink } from "node:fs/promises";
import { TEMP_DIR } from "./uploads.js";

export interface UploadSession {
  id: string;
  eventId: string;
  householdId: string;
  filename: string;
  mimeType: string;
  totalSize: number;
  receivedBytes: number;
  nextChunkIndex: number;
  tempPath: string;
  createdAt: number;
}

// 셀프호스팅 단일 인스턴스 — drop과 동일하게 프로세스 메모리에 세션을 둔다.
const sessions = new Map<string, UploadSession>();

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function createUploadSession(
  eventId: string,
  householdId: string,
  filename: string,
  mimeType: string,
  totalSize: number,
): UploadSession {
  const id = randomUUID();
  const session: UploadSession = {
    id,
    eventId,
    householdId,
    filename,
    mimeType,
    totalSize,
    receivedBytes: 0,
    nextChunkIndex: 0,
    tempPath: path.join(TEMP_DIR, `${id}.part`),
    createdAt: Date.now(),
  };
  sessions.set(id, session);
  return session;
}

export function getUploadSession(id: string): UploadSession | undefined {
  return sessions.get(id);
}

export function deleteUploadSession(id: string): void {
  sessions.delete(id);
}

export async function sweepStaleUploadSessions(): Promise<void> {
  const now = Date.now();
  for (const session of sessions.values()) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      await unlink(session.tempPath).catch(() => {});
      sessions.delete(session.id);
    }
  }
}
