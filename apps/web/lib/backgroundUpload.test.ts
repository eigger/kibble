import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./eventAttachments", () => ({
  uploadEventAttachments: vi.fn(),
}));

import { uploadEventAttachments } from "./eventAttachments";
import {
  getBackgroundUpload,
  mergeTimelineAttachments,
  resetBackgroundUploadForTests,
  retryBackgroundUpload,
  startBackgroundUpload,
} from "./backgroundUpload";
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
    expect(getBackgroundUpload()?.status).toBe("uploading");
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
      expect(getBackgroundUpload()?.status).toBe("partial");
    });
    retryBackgroundUpload();
    await vi.waitFor(() => {
      expect(getBackgroundUpload()).toBeNull();
    });
    expect(uploadMock).toHaveBeenCalledTimes(2);
  });
});
