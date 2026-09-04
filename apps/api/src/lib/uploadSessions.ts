import { randomUUID } from "node:crypto";
import path from "node:path";
import { mkdir, readdir, readFile, stat, truncate, unlink, writeFile } from "node:fs/promises";
import { UPLOAD_CHUNK_SIZE_BYTES } from "@kibble/shared";
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

/**
 * 진행 중인 세션. 메모리는 **캐시**일 뿐이고 진실은 디스크에 있다 —
 * `<id>.part`(받은 바이트)와 `<id>.json`(누구의 무슨 파일인지).
 *
 * 예전에는 메모리가 전부였다. 그래서 API가 재시작하면 진행 중이던 업로드가 전부
 * 404가 되고 처음부터 다시 올려야 했다. 384MB 영상이 수십 분 올라가다 배포 한 번에
 * 통째로 날아간 게 실제로 있었던 일이다 — 재개는 그때 가장 필요한데 정확히 그때
 * 동작하지 않았다.
 *
 * 셀프호스트 단일 인스턴스 전제는 그대로다. 사이드카 JSON이면 마이그레이션도,
 * 새 인프라도 필요 없고 조각 파일과 수명이 같아 스윕도 한곳에서 처리된다.
 */
const sessions = new Map<string, UploadSession>();

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function tempPathFor(id: string): string {
  return path.join(TEMP_DIR, `${id}.part`);
}

function sidecarPathFor(id: string): string {
  return path.join(TEMP_DIR, `${id}.json`);
}

/** 사이드카에 담는 것은 **변하지 않는 정보**뿐이다 — 진행량은 .part 크기가 말해 준다. */
type SessionSidecar = {
  id: string;
  eventId: string;
  householdId: string;
  filename: string;
  mimeType: string;
  totalSize: number;
  createdAt: number;
};

function toSidecar(session: UploadSession): SessionSidecar {
  return {
    id: session.id,
    eventId: session.eventId,
    householdId: session.householdId,
    filename: session.filename,
    mimeType: session.mimeType,
    totalSize: session.totalSize,
    createdAt: session.createdAt,
  };
}

/** 디스크에서 읽은 값은 우리가 쓴 것이라도 믿지 않는다 — 손상된 파일이면 세션이 없는 셈 친다. */
function parseSidecar(raw: string): SessionSidecar | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const s = value as Record<string, unknown>;
  const strings = ["id", "eventId", "householdId", "filename", "mimeType"] as const;
  for (const key of strings) {
    if (typeof s[key] !== "string" || !s[key]) return null;
  }
  if (typeof s.totalSize !== "number" || !Number.isSafeInteger(s.totalSize) || s.totalSize <= 0) {
    return null;
  }
  if (typeof s.createdAt !== "number" || !Number.isFinite(s.createdAt)) return null;
  return value as SessionSidecar;
}

export async function createUploadSession(
  eventId: string,
  householdId: string,
  filename: string,
  mimeType: string,
  totalSize: number,
): Promise<UploadSession> {
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
    tempPath: tempPathFor(id),
    createdAt: Date.now(),
  };
  sessions.set(id, session);

  await mkdir(TEMP_DIR, { recursive: true });
  await writeFile(sidecarPathFor(id), JSON.stringify(toSidecar(session)), "utf8");
  return session;
}

/**
 * 재시작 뒤 디스크에서 세션을 되살린다.
 *
 * 진행량은 사이드카가 아니라 **`.part` 파일 크기**가 정답이다. `appendFile`은 원자적이
 * 아니라 프로세스가 append 도중 죽으면 청크 경계에 걸치지 않는 꼬리가 남을 수 있다 —
 * 그래서 되살릴 때는 경계까지 내림한 값을 보고한다.
 *
 * **여기서 디스크를 고치지는 않는다 (K-7).** 진행 조회는 GET이고, GET이 파일을 자르면
 * 포스터 지연 백필을 기각한 것(R69)과 같은 규칙이 흔들린다. 실제 잘라내기는 쓰기 경로
 * (`alignTempFileForWrite`)에서 한다 — 보고한 위치 뒤에 꼬리가 남아 있어도 append 전에
 * 정리되므로 파일이 깨질 일은 없다.
 */
async function rehydrateSession(id: string): Promise<UploadSession | undefined> {
  let sidecar: SessionSidecar | null;
  try {
    sidecar = parseSidecar(await readFile(sidecarPathFor(id), "utf8"));
  } catch {
    return undefined;
  }
  if (!sidecar || sidecar.id !== id) return undefined;

  const tempPath = tempPathFor(id);
  // 파일이 없으면 아직 첫 청크가 오지 않은 것 — 0부터 시작한다
  const onDisk = await stat(tempPath)
    .then((info) => info.size)
    .catch(() => 0);

  let receivedBytes = Math.min(onDisk, sidecar.totalSize);
  // 마지막 청크는 경계에 안 맞는 게 정상이다(complete 대기) — 그때는 내리지 않는다.
  if (receivedBytes < sidecar.totalSize) {
    receivedBytes = Math.floor(receivedBytes / UPLOAD_CHUNK_SIZE_BYTES) * UPLOAD_CHUNK_SIZE_BYTES;
  }

  const session: UploadSession = {
    ...sidecar,
    receivedBytes,
    nextChunkIndex: Math.ceil(receivedBytes / UPLOAD_CHUNK_SIZE_BYTES),
    tempPath,
  };
  sessions.set(id, session);
  return session;
}

export async function getUploadSession(id: string): Promise<UploadSession | undefined> {
  return sessions.get(id) ?? (await rehydrateSession(id));
}

// 청크 쓰기는 "인덱스 확인 → appendFile → 카운터 증가"라 await 사이에 다른 요청이 끼면
// 같은 인덱스가 두 번 append되어 파일이 깨진다. 웹 클라이언트는 순차 전송이지만 서버가
// 그걸 믿을 이유는 없다 — 세션당 한 번에 하나만 쓰게 잠근다.
const writing = new Set<string>();

/**
 * `.part`를 세션이 아는 길이에 맞춘다. 크래시로 남은 꼬리를 여기서 걷어낸다.
 *
 * 되살리기(GET)는 계산만 하고 디스크를 건드리지 않으므로(K-7), 실제 수리는 **쓰기
 * 직전 딱 한 번** 여기서 일어난다. append 전에 부르는 것이 계약이다 — 안 그러면
 * 남은 꼬리 뒤에 새 청크가 붙어 영상이 조용히 깨진다.
 */
export async function alignTempFileForWrite(session: UploadSession): Promise<void> {
  let onDisk: number;
  try {
    onDisk = (await stat(session.tempPath)).size;
  } catch {
    return; // 아직 파일이 없다 — 첫 append가 만든다
  }
  if (onDisk > session.receivedBytes) {
    await truncate(session.tempPath, session.receivedBytes);
  }
}

/** 잠금을 얻으면 true. 이미 쓰는 중이면 false — 호출부는 409로 돌려보낸다. */
export function acquireChunkWriteLock(id: string): boolean {
  if (writing.has(id)) return false;
  writing.add(id);
  return true;
}

export function releaseChunkWriteLock(id: string): void {
  writing.delete(id);
}

export async function deleteUploadSession(id: string): Promise<void> {
  sessions.delete(id);
  writing.delete(id);
  await unlink(sidecarPathFor(id)).catch(() => {});
}

export async function sweepStaleUploadSessions(): Promise<void> {
  const now = Date.now();
  for (const session of sessions.values()) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      await unlink(session.tempPath).catch(() => {});
      await unlink(sidecarPathFor(session.id)).catch(() => {});
      sessions.delete(session.id);
    }
  }
  await sweepStaleTempFiles(now);
}

/**
 * 조각과 사이드카는 짝이다 — 24시간이 지나면 둘 다 지운다. 메모리에 살아 있는 세션은
 * 건드리지 않는다(느린 회선에서 오래 걸리는 업로드가 있을 수 있다).
 *
 * 영상 포스터 추출이 쓰는 `poster-*.jpg`도 같이 본다. 정상 경로에서는 추출 직후
 * `finally`가 지우지만, 그 사이에 프로세스가 죽으면 남는다 — 주인이 없는 파일이라
 * 시간 말고는 판단할 근거가 없다.
 */
async function sweepStaleTempFiles(now: number): Promise<void> {
  const live = new Set(sessions.keys());

  let entries: string[];
  try {
    entries = await readdir(TEMP_DIR);
  } catch {
    return; // tmp 디렉터리가 아직 없으면 지울 것도 없다
  }

  for (const entry of entries) {
    let sweepable = false;
    if (entry.endsWith(".part")) {
      sweepable = !live.has(entry.slice(0, -".part".length));
    } else if (entry.endsWith(".json")) {
      sweepable = !live.has(entry.slice(0, -".json".length));
    } else if (entry.startsWith("poster-") && entry.endsWith(".jpg")) {
      sweepable = true;
    }
    if (!sweepable) continue;

    const filePath = path.join(TEMP_DIR, entry);
    try {
      const info = await stat(filePath);
      if (now - info.mtimeMs > SESSION_TTL_MS) await unlink(filePath);
    } catch {
      // 이미 지워졌거나 접근 불가 — 다음 스윕에서 다시 본다
    }
  }
}
