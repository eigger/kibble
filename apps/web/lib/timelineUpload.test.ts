import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("./eventAttachments", () => ({
  uploadEventAttachments: vi.fn(),
}));

import { uploadEventAttachments } from "./eventAttachments";
import {
  getBackgroundUpload,
  resetBackgroundUploadForTests,
  startBackgroundUpload,
} from "./backgroundUpload";
import { TimelineUploadStatus } from "../components/TimelineUploadStatus";
import { LocaleProvider } from "./i18n/locale-context";

const uploadMock = vi.mocked(uploadEventAttachments);

function renderWithLocale(element: React.ReactElement): string {
  return renderToStaticMarkup(React.createElement(LocaleProvider, null, element));
}

afterEach(() => {
  resetBackgroundUploadForTests();
  uploadMock.mockReset();
});

describe("TimelineUploadStatus", () => {
  it("renders null when no uploads are active or failed", () => {
    const html = renderWithLocale(
      React.createElement(TimelineUploadStatus, { eventId: "evt-1" }),
    );
    expect(html).toBe("");
  });

  it("renders uploading status with CSS spinner and no emoji when event is uploading", () => {
    uploadMock.mockReturnValue(new Promise(() => {}));
    startBackgroundUpload("evt-1", [new File(["x"], "photo.jpg", { type: "image/jpeg" })]);

    const html = renderWithLocale(
      React.createElement(TimelineUploadStatus, { eventId: "evt-1" }),
    );
    expect(html).toContain("timeline-upload-badge-uploading");
    expect(html).toContain("timeline-upload-spinner");
    expect(html).toContain("사진 올리는 중");
    expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });

  it("renders failure badge with SVG icon and no emoji when event has failed uploads", async () => {
    const leftover = new File(["x"], "bad.jpg", { type: "image/jpeg" });
    uploadMock.mockResolvedValueOnce({ uploaded: [], remaining: [leftover] });

    startBackgroundUpload("evt-fail", [leftover]);

    await vi.waitFor(() => {
      expect(getBackgroundUpload()?.failedCount).toBe(1);
    });

    const html = renderWithLocale(
      React.createElement(TimelineUploadStatus, { eventId: "evt-fail" }),
    );
    expect(html).toContain("timeline-upload-badge-failed");
    expect(html).toContain("timeline-upload-icon");
    expect(html).toContain("업로드 실패 (1)");
    // Must contain SVG circle/line, and zero emoji characters
    expect(html).toContain("<svg");
    expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    expect(html).not.toContain("⚠️");
  });
});
