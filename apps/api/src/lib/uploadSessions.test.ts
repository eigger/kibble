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
