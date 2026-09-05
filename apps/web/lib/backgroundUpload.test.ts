import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./eventAttachments", () => ({
  uploadEventAttachments: vi.fn(),
}));

import { uploadEventAttachments } from "./eventAttachments";
import {
  cancelBackgroundUpload,
  getBackgroundUpload,
  mergeTimelineAttachments,
  resetBackgroundUploadForTests,
  retryBackgroundUpload,
  startBackgroundUpload,
} from "./backgroundUpload";
import * as backgroundFetchUpload from "./backgroundFetchUpload";
import type { EventAttachment, TimelineEvent } from "./types";

const uploadMock = vi.mocked(uploadEventAttachments);

function file(name: string): File {
  return new File(["x"], name, { type: "image/jpeg" });
}

afterEach(() => {
  resetBackgroundUploadForTests();
  uploadMock.mockReset();
});

describe("mergeTimelineAttachments", () => {
  it("appends uploaded files onto the matching event", () => {
    const uploaded: EventAttachment = {
      id: "a1",
      path: "e/a.jpg",
      mime: "image/jpeg",
      size: 1,
      width: null,
      height: null,
    };
    const events = [
      { id: "e1", attachments: [] },
      { id: "e2", attachments: [] },
    ] as unknown as TimelineEvent[];
    const next = mergeTimelineAttachments(events, "e1", [uploaded]);
    expect(next[0].attachments).toEqual([uploaded]);
    expect(next[1].attachments).toEqual([]);
  });
});

describe("startBackgroundUpload", () => {
  it("uploads then clears snapshot", async () => {
    uploadMock.mockResolvedValue({ uploaded: [], remaining: [] });
    startBackgroundUpload("e1", [file("a.jpg")]);
    expect(getBackgroundUpload()?.current?.eventId).toBe("e1");
    await vi.waitFor(() => {
      expect(getBackgroundUpload()).toBeNull();
    });
    expect(uploadMock).toHaveBeenCalledOnce();
  });

  it("keeps remaining files for retry", async () => {
    const leftover = file("b.jpg");
    uploadMock.mockResolvedValueOnce({ uploaded: [], remaining: [leftover] });
    uploadMock.mockResolvedValueOnce({ uploaded: [], remaining: [] });
    startBackgroundUpload("e1", [file("a.jpg"), leftover]);
    await vi.waitFor(() => {
      expect(getBackgroundUpload()?.failedCount).toBe(1);
      expect(getBackgroundUpload()?.current).toBeNull();
    });
    retryBackgroundUpload();
    await vi.waitFor(() => {
      expect(getBackgroundUpload()).toBeNull();
    });
    expect(uploadMock).toHaveBeenCalledTimes(2);
  });

  it("does not drop leftover files when another upload starts", async () => {
    const leftover = file("b.jpg");
    uploadMock.mockResolvedValueOnce({ uploaded: [], remaining: [leftover] });
    uploadMock.mockResolvedValueOnce({ uploaded: [], remaining: [] });
    startBackgroundUpload("e1", [file("a.jpg"), leftover]);
    startBackgroundUpload("e2", [file("c.jpg")]);
    await vi.waitFor(() => {
      expect(uploadMock).toHaveBeenCalledTimes(2);
    });
    expect(uploadMock.mock.calls[0][0]).toBe("e1");
    expect(uploadMock.mock.calls[1][0]).toBe("e2");
    expect(getBackgroundUpload()?.failedCount).toBe(1);
    expect(getBackgroundUpload()?.current).toBeNull();
  });

  it("holds files and clears uploading when the batch throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    uploadMock.mockRejectedValueOnce(new Error("boom"));
    startBackgroundUpload("e1", [file("a.jpg")]);
    await vi.waitFor(() => {
      expect(getBackgroundUpload()?.failedCount).toBe(1);
      expect(getBackgroundUpload()?.current).toBeNull();
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("cancel stops the job without listing it as failed", async () => {
    const { UploadCancelledError } = await import("./uploadAbort");
    uploadMock.mockImplementation((_id, _files, _progress, signal) => {
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new UploadCancelledError()));
      });
    });
    startBackgroundUpload("e1", [file("a.jpg")]);
    await vi.waitFor(() => {
      expect(getBackgroundUpload()?.current?.eventId).toBe("e1");
    });
    cancelBackgroundUpload();
    await vi.waitFor(() => {
      expect(getBackgroundUpload()).toBeNull();
    });
  });

  it("hands off to Background Fetch and does not upload in the page", async () => {
    const canUse = vi.spyOn(backgroundFetchUpload, "canUseBackgroundFetch").mockResolvedValue(true);
    const startVia = vi.spyOn(backgroundFetchUpload, "startViaBackgroundFetch").mockResolvedValue(true);
    startBackgroundUpload("e1", [file("a.jpg")]);
    await vi.waitFor(() => {
      expect(startVia).toHaveBeenCalledWith("e1", expect.any(Array), expect.any(Function));
    });
    expect(uploadMock).not.toHaveBeenCalled();
    expect(getBackgroundUpload()?.current?.canLeave).toBe(true);
    canUse.mockRestore();
    startVia.mockRestore();
  });

  it("cleans up background fetch failed jobs when foreground upload succeeds", async () => {
    const abortBf = vi.spyOn(backgroundFetchUpload, "abortBackgroundFetchesFor").mockResolvedValue();
    const uploaded: EventAttachment = {
      id: "a1",
      path: "e/a.jpg",
      mime: "image/jpeg",
      size: 1,
      width: null,
      height: null,
    };
    uploadMock.mockResolvedValueOnce({ uploaded: [uploaded], remaining: [] });
    startBackgroundUpload("e1", [file("a.jpg")]);
    await vi.waitFor(() => {
      expect(getBackgroundUpload()).toBeNull();
    });
    expect(abortBf).toHaveBeenCalledOnce();
    abortBf.mockRestore();
  });
});
