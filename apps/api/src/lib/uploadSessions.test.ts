import { access, appendFile, mkdtemp, mkdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UPLOAD_CHUNK_SIZE_BYTES } from "@kibble/shared";

type SessionsModule = typeof import("./uploadSessions.js");

/**
 * 세션 모듈은 TEMP_DIR을 모듈 로드 시점에 굳히므로, 테스트마다 UPLOAD_DIR을 새로 잡고
 * 다시 import한다. 재시작 시뮬레이션도 같은 방법으로 한다 — 새로 import하면 메모리
 * 맵이 비어 있는, 갓 켜진 프로세스와 같은 상태가 된다.
 */
async function loadSessions(): Promise<SessionsModule> {
  vi.resetModules();
  return import("./uploadSessions.js");
}

async function exists(filePath: string): Promise<boolean> {
  return access(filePath)
    .then(() => true)
    .catch(() => false);
}

describe("uploadSessions", () => {
  let uploadDir = "";
  let tempDir = "";
  let sessions: SessionsModule;

  beforeEach(async () => {
    uploadDir = await mkdtemp(path.join(tmpdir(), "kibble-session-"));
    process.env.UPLOAD_DIR = uploadDir;
    tempDir = path.join(uploadDir, "tmp");
    sessions = await loadSessions();
  });

  afterEach(async () => {
    delete process.env.UPLOAD_DIR;
    vi.resetModules();
    vi.useRealTimers();
    if (uploadDir) await rm(uploadDir, { recursive: true, force: true }).catch(() => {});
  });

  it("creates and retrieves a session", async () => {
    const session = await sessions.createUploadSession("evt1", "hh1", "clip.mov", "video/quicktime", 1000);
    expect((await sessions.getUploadSession(session.id))?.eventId).toBe("evt1");
    expect((await sessions.getUploadSession(session.id))?.householdId).toBe("hh1");

    await sessions.deleteUploadSession(session.id);
    expect(await sessions.getUploadSession(session.id)).toBeUndefined();
    // 사이드카가 남으면 지운 세션이 재시작 후 되살아난다
    expect(await exists(path.join(tempDir, `${session.id}.json`))).toBe(false);
  });

  it("sweeps sessions older than 24 hours", async () => {
    const stale = await sessions.createUploadSession("evt1", "hh1", "old.bin", "video/mp4", 10);
    vi.useFakeTimers();
    vi.advanceTimersByTime(25 * 60 * 60 * 1000);
    const fresh = await sessions.createUploadSession("evt1", "hh1", "new.bin", "video/mp4", 10);

    await sessions.sweepStaleUploadSessions();

    expect(await sessions.getUploadSession(stale.id)).toBeUndefined();
    expect((await sessions.getUploadSession(fresh.id))?.filename).toBe("new.bin");
  });

  /**
   * 이것이 이 파일의 핵심이다. 예전에는 세션이 메모리에만 있어 배포 한 번에 진행 중이던
   * 업로드가 전부 404가 됐다 — 384MB 영상이 수십 분 올라가다 통째로 날아간 게 실제로
   * 있었던 일이다.
   */
  describe("재시작 후 재개", () => {
    it("rehydrates a half-finished upload from disk", async () => {
      const totalSize = UPLOAD_CHUNK_SIZE_BYTES * 3;
      const session = await sessions.createUploadSession("evt1", "hh1", "clip.mp4", "video/mp4", totalSize);
      await mkdir(tempDir, { recursive: true });
      await appendFile(session.tempPath, Buffer.alloc(UPLOAD_CHUNK_SIZE_BYTES * 2));

      // 재시작 — 메모리 맵이 빈 새 프로세스
      const restarted = await loadSessions();
      const revived = await restarted.getUploadSession(session.id);

      expect(revived).toBeDefined();
      expect(revived?.eventId).toBe("evt1");
      expect(revived?.householdId).toBe("hh1");
      expect(revived?.mimeType).toBe("video/mp4");
      expect(revived?.totalSize).toBe(totalSize);
      // 진행량은 사이드카가 아니라 .part 크기가 말해 준다
      expect(revived?.receivedBytes).toBe(UPLOAD_CHUNK_SIZE_BYTES * 2);
      expect(revived?.nextChunkIndex).toBe(2);
    });

    it("resumes at zero when no chunk arrived before the restart", async () => {
      const session = await sessions.createUploadSession("evt1", "hh1", "clip.mp4", "video/mp4", 1000);

      const restarted = await loadSessions();
      const revived = await restarted.getUploadSession(session.id);

      expect(revived?.receivedBytes).toBe(0);
      expect(revived?.nextChunkIndex).toBe(0);
    });

    // appendFile은 원자적이 아니다 — append 도중 죽으면 청크 경계에 걸치지 않는 꼬리가
    // 남는다. 그대로 이어 붙이면 파일이 깨지므로 경계까지 잘라내고 다시 받는다.
    it("truncates a torn chunk back to the last boundary", async () => {
      const totalSize = UPLOAD_CHUNK_SIZE_BYTES * 3;
      const session = await sessions.createUploadSession("evt1", "hh1", "clip.mp4", "video/mp4", totalSize);
      await mkdir(tempDir, { recursive: true });
      await appendFile(session.tempPath, Buffer.alloc(UPLOAD_CHUNK_SIZE_BYTES + 1234));

      const restarted = await loadSessions();
      const revived = await restarted.getUploadSession(session.id);

      expect(revived?.receivedBytes).toBe(UPLOAD_CHUNK_SIZE_BYTES);
      expect(revived?.nextChunkIndex).toBe(1);
      expect((await stat(session.tempPath)).size).toBe(UPLOAD_CHUNK_SIZE_BYTES);
    });

    it("keeps a complete file that was waiting for /complete", async () => {
      const totalSize = UPLOAD_CHUNK_SIZE_BYTES + 500;
      const session = await sessions.createUploadSession("evt1", "hh1", "clip.mp4", "video/mp4", totalSize);
      await mkdir(tempDir, { recursive: true });
      await appendFile(session.tempPath, Buffer.alloc(totalSize));

      const restarted = await loadSessions();
      const revived = await restarted.getUploadSession(session.id);

      // 마지막 청크는 경계에 안 맞는 게 정상이다 — 잘라내면 안 된다
      expect(revived?.receivedBytes).toBe(totalSize);
      expect((await stat(session.tempPath)).size).toBe(totalSize);
    });

    it("treats a corrupt sidecar as no session", async () => {
      const session = await sessions.createUploadSession("evt1", "hh1", "clip.mp4", "video/mp4", 1000);
      await writeFile(path.join(tempDir, `${session.id}.json`), "{ not json");

      const restarted = await loadSessions();
      expect(await restarted.getUploadSession(session.id)).toBeUndefined();
    });

    it("does not resurrect a finished session", async () => {
      const session = await sessions.createUploadSession("evt1", "hh1", "clip.mp4", "video/mp4", 1000);
      await sessions.deleteUploadSession(session.id);

      const restarted = await loadSessions();
      expect(await restarted.getUploadSession(session.id)).toBeUndefined();
    });

    it("writes only immutable fields to the sidecar", async () => {
      const session = await sessions.createUploadSession("evt1", "hh1", "clip.mp4", "video/mp4", 1000);
      const raw = JSON.parse(await readFile(path.join(tempDir, `${session.id}.json`), "utf8"));
      // 진행량을 적어 두면 청크마다 디스크를 쳐야 하고, 크래시 시 .part와 어긋난다
      expect(raw).not.toHaveProperty("receivedBytes");
      expect(raw).not.toHaveProperty("nextChunkIndex");
      expect(raw.totalSize).toBe(1000);
    });
  });
});

describe("sweepStaleUploadSessions — 고아 임시 파일", () => {
  let uploadDir = "";
  let tempDir = "";

  beforeEach(async () => {
    uploadDir = await mkdtemp(path.join(tmpdir(), "kibble-sweep-"));
    process.env.UPLOAD_DIR = uploadDir;
    tempDir = path.join(uploadDir, "tmp");
    vi.resetModules();
  });

  afterEach(async () => {
    delete process.env.UPLOAD_DIR;
    vi.resetModules();
    if (uploadDir) await rm(uploadDir, { recursive: true, force: true }).catch(() => {});
  });

  it("deletes stale part files and their sidecars, keeps the rest", async () => {
    const sessions = await loadSessions();
    await mkdir(tempDir, { recursive: true });

    const stalePart = path.join(tempDir, "gone-after-restart.part");
    const staleSidecar = path.join(tempDir, "gone-after-restart.json");
    const freshPart = path.join(tempDir, "still-warm.part");
    const notOurs = path.join(tempDir, "keep-me.txt");
    for (const filePath of [stalePart, staleSidecar, freshPart, notOurs]) {
      await writeFile(filePath, "x");
    }
    const longAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    for (const filePath of [stalePart, staleSidecar, notOurs]) {
      await utimes(filePath, longAgo, longAgo);
    }

    // 살아 있는 세션의 조각은 오래돼 보여도 건드리지 않는다
    const live = await sessions.createUploadSession("evt1", "hh1", "clip.mp4", "video/mp4", 100);
    await writeFile(live.tempPath, "chunk");
    await utimes(live.tempPath, longAgo, longAgo);

    await sessions.sweepStaleUploadSessions();

    expect(await exists(stalePart)).toBe(false);
    expect(await exists(staleSidecar)).toBe(false);
    expect(await exists(freshPart)).toBe(true);
    expect(await exists(notOurs)).toBe(true);
    expect(await exists(live.tempPath)).toBe(true);
  });
});
