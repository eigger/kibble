import { access, mkdtemp, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createUploadSession,
  deleteUploadSession,
  getUploadSession,
  sweepStaleUploadSessions,
} from "./uploadSessions.js";

describe("uploadSessions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates and retrieves a session", () => {
    const session = createUploadSession("evt1", "hh1", "clip.mov", "video/quicktime", 1000);
    expect(getUploadSession(session.id)?.eventId).toBe("evt1");
    expect(getUploadSession(session.id)?.householdId).toBe("hh1");
    deleteUploadSession(session.id);
    expect(getUploadSession(session.id)).toBeUndefined();
  });

  it("sweeps sessions older than 24 hours", async () => {
    const stale = createUploadSession("evt1", "hh1", "old.bin", "application/octet-stream", 10);
    vi.advanceTimersByTime(25 * 60 * 60 * 1000);
    const fresh = createUploadSession("evt1", "hh1", "new.bin", "application/octet-stream", 10);

    await sweepStaleUploadSessions();

    expect(getUploadSession(stale.id)).toBeUndefined();
    expect(getUploadSession(fresh.id)?.filename).toBe("new.bin");
    deleteUploadSession(fresh.id);
  });
});

// 세션은 프로세스 메모리에만 산다 — API가 재시작하면 진행 중이던 .part 조각의 주인이
// 사라져 메모리 기준 스윕으로는 영영 안 지워졌다. 재시작 후에만 드러나는 회귀라 테스트로 못박는다.
describe("sweepStaleUploadSessions — 고아 임시 조각", () => {
  let uploadDir = "";

  beforeEach(async () => {
    uploadDir = await mkdtemp(path.join(tmpdir(), "kibble-sweep-"));
    process.env.UPLOAD_DIR = uploadDir;
    vi.resetModules();
  });

  afterEach(async () => {
    delete process.env.UPLOAD_DIR;
    vi.resetModules();
    if (uploadDir) await rm(uploadDir, { recursive: true, force: true }).catch(() => {});
  });

  async function exists(filePath: string): Promise<boolean> {
    return access(filePath)
      .then(() => true)
      .catch(() => false);
  }

  it("deletes ownerless .part files older than the TTL and keeps the rest", async () => {
    const sessions = await import("./uploadSessions.js");
    const { TEMP_DIR } = await import("./uploads.js");
    await mkdir(TEMP_DIR, { recursive: true });

    const orphanStale = path.join(TEMP_DIR, "gone-after-restart.part");
    const orphanFresh = path.join(TEMP_DIR, "still-warm.part");
    const notAPart = path.join(TEMP_DIR, "keep-me.txt");
    for (const filePath of [orphanStale, orphanFresh, notAPart]) {
      await writeFile(filePath, "chunk");
    }
    const longAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await utimes(orphanStale, longAgo, longAgo);
    await utimes(notAPart, longAgo, longAgo);

    // 살아 있는 세션의 조각은 오래돼 보여도 건드리지 않는다
    const live = sessions.createUploadSession("evt1", "hh1", "clip.mp4", "video/mp4", 100);
    await writeFile(live.tempPath, "chunk");
    await utimes(live.tempPath, longAgo, longAgo);

    await sessions.sweepStaleUploadSessions();

    expect(await exists(orphanStale)).toBe(false);
    expect(await exists(orphanFresh)).toBe(true);
    expect(await exists(notAPart)).toBe(true);
    expect(await exists(live.tempPath)).toBe(true);

    sessions.deleteUploadSession(live.id);
  });
});
