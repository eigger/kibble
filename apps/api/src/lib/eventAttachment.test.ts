import { describe, expect, it } from "vitest";
import sharp from "sharp";
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

  // 안드로이드 갤러리·카메라가 내놓는 컨테이너들 — 영상은 재인코딩 없이 저장한다
  it("accepts the android video containers", () => {
    expect(ALLOWED_ATTACHMENT_MIME.has("video/webm")).toBe(true);
    expect(ALLOWED_ATTACHMENT_MIME.has("video/3gpp")).toBe(true);
    expect(ALLOWED_ATTACHMENT_MIME.has("video/x-matroska")).toBe(true);
  });

  // 받아놓고 sharp가 못 열어 "손상된 이미지"로 되돌려주는 일이 없어야 한다
  it("allows heic only when sharp can actually decode it", () => {
    const decodable = sharp.format.heif?.input?.fileSuffix?.includes(".heic") ?? false;
    expect(ALLOWED_ATTACHMENT_MIME.has("image/heic")).toBe(decodable);
    expect(ALLOWED_ATTACHMENT_MIME.has("image/heif")).toBe(decodable);
  });
});

// 상한이 허용하는 크기와 "끝까지 올릴 수 있는 크기"가 달랐다 — 384MB 영상이 수십 분
// 올라가다 끊겨 tmp/에 조각만 남는 일이 실제로 있었다. 기본값은 낮게 두고 필요한
// 설치만 env로 올린다.
describe("FILE_SIZE_LIMIT_BYTES", () => {
  it("defaults to 150MB", async () => {
    const { FILE_SIZE_LIMIT_BYTES } = await import("./uploads.js");
    expect(FILE_SIZE_LIMIT_BYTES).toBe(150 * 1024 * 1024);
  });
});
