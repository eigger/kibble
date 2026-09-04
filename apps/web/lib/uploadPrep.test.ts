import { describe, expect, it } from "vitest";
import { normalizeAttachmentType, prepareAttachmentForUpload } from "./uploadPrep";

describe("normalizeAttachmentType", () => {
  it("keeps a declared type", () => {
    expect(normalizeAttachmentType(new File(["x"], "a.jpg", { type: "image/jpeg" }))).toBe(
      "image/jpeg",
    );
  });

  // 안드로이드 파일 제공자·공유 시트는 type이 빈 File을 준다 — 그대로 보내면 400이었다
  it("falls back to the extension when the picker gives no type", () => {
    expect(normalizeAttachmentType(new File(["x"], "IMG_0001.HEIC"))).toBe("image/heic");
    expect(normalizeAttachmentType(new File(["x"], "clip.MOV"))).toBe("video/quicktime");
    expect(normalizeAttachmentType(new File(["x"], "clip.webm"))).toBe("video/webm");
  });

  it("replaces octet-stream with the extension type", () => {
    const file = new File(["x"], "clip.mp4", { type: "application/octet-stream" });
    expect(normalizeAttachmentType(file)).toBe("video/mp4");
  });

  it("leaves an unknown extension alone", () => {
    expect(normalizeAttachmentType(new File(["x"], "notes"))).toBe("");
  });
});

describe("prepareAttachmentForUpload", () => {
  // 캔버스가 없는 환경(SSR·테스트·구형 WebView)에서는 리인코딩을 건너뛰고
  // 원본을 그대로 올린다 — 여기서 파일을 거부하지 않는다 (K-12)
  it("returns the original file when re-encoding is unavailable", async () => {
    const file = new File(["x"], "a.jpg", { type: "image/jpeg" });
    const prepared = await prepareAttachmentForUpload(file);
    expect(prepared.name).toBe("a.jpg");
    expect(prepared.type).toBe("image/jpeg");
  });

  it("repairs a missing type without touching the bytes", async () => {
    const file = new File(["hello"], "clip.mov");
    const prepared = await prepareAttachmentForUpload(file);
    expect(prepared.type).toBe("video/quicktime");
    expect(prepared.size).toBe(file.size);
  });
});
