import { describe, expect, it } from "vitest";
import { attachmentAbsolutePath, ALLOWED_ATTACHMENT_MIME } from "./eventAttachment.js";

describe("eventAttachment", () => {
  it("rejects path traversal", () => {
    expect(() => attachmentAbsolutePath("../etc/passwd")).toThrow("PATH_ESCAPE");
  });

  it("allows nested event paths", () => {
    const abs = attachmentAbsolutePath("events/pet-abc.jpg");
    expect(abs).toContain("events");
    expect(abs).toContain("pet-abc.jpg");
  });

  it("whitelists image and video mime types", () => {
    expect(ALLOWED_ATTACHMENT_MIME.has("image/jpeg")).toBe(true);
    expect(ALLOWED_ATTACHMENT_MIME.has("video/mp4")).toBe(true);
    expect(ALLOWED_ATTACHMENT_MIME.has("application/pdf")).toBe(false);
  });
});
