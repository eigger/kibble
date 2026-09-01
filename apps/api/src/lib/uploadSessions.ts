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

// 청크 쓰기는 "인덱스 확인 → appendFile → 카운터 증가"라 await 사이에 다른 요청이 끼면
// 같은 인덱스가 두 번 append되어 파일이 깨진다. 웹 클라이언트는 순차 전송이지만 서버가
// 그걸 믿을 이유는 없다 — 세션당 한 번에 하나만 쓰게 잠근다.
const writing = new Set<string>();

/** 잠금을 얻으면 true. 이미 쓰는 중이면 false — 호출부는 409로 돌려보낸다. */
export function acquireChunkWriteLock(id: string): boolean {
  if (writing.has(id)) return false;
  writing.add(id);
  return true;
}

export function releaseChunkWriteLock(id: string): void {
  writing.delete(id);
}

export function deleteUploadSession(id: string): void {
  sessions.delete(id);
  writing.delete(id);
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
