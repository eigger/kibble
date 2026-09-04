import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DECODE_TIMEOUT_MS,
  LocalFileError,
  isLocalFileFailure,
  normalizeAttachmentType,
  prepareAttachmentForUpload,
  snapshotFile,
  withTimeout,
} from "./uploadPrep";

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

  it("does not canvas-reencode jpeg the server can already open", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(() => new Promise(() => {})),
    );
    const file = new File(["jpeg-bytes"], "a.jpg", { type: "image/jpeg" });
    const prepared = await prepareAttachmentForUpload(file);
    expect(prepared.type).toBe("image/jpeg");
    expect(createImageBitmap).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("withTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects when the promise never settles", async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise(() => {}), DECODE_TIMEOUT_MS, "BITMAP_TIMEOUT");
    const assertion = expect(pending).rejects.toThrow("BITMAP_TIMEOUT");
    await vi.advanceTimersByTimeAsync(DECODE_TIMEOUT_MS);
    await assertion;
  });

  it("resolves when the inner promise wins", async () => {
    await expect(withTimeout(Promise.resolve(7), DECODE_TIMEOUT_MS, "BITMAP_TIMEOUT")).resolves.toBe(7);
  });
});

describe("snapshotFile", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("copies bytes so later reads do not depend on the picker URI", async () => {
    const file = new File(["hello"], "IMG_0001.HEIF", { type: "image/heif" });
    const snapped = await snapshotFile(file);
    expect(snapped).not.toBe(file);
    expect(snapped.size).toBe(file.size);
    const copied = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(snapped);
    });
    expect(copied).toBe("hello");
  });

  it("returns the same File on a second snapshot", async () => {
    const file = new File(["hello"], "a.jpg", { type: "image/jpeg" });
    const once = await snapshotFile(file);
    const twice = await snapshotFile(once);
    expect(twice).toBe(once);
  });

  it("throws LocalFileError when the picker file cannot be read", async () => {
    const file = new File(["x"], "a.heif", { type: "image/heif" });
    Object.defineProperty(file, "arrayBuffer", {
      configurable: true,
      value: () => Promise.reject(new DOMException("locked", "NotReadableError")),
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(snapshotFile(file)).rejects.toBeInstanceOf(LocalFileError);
    errorSpy.mockRestore();
  });

  it("throws LocalFileError when arrayBuffer never settles", async () => {
    vi.useFakeTimers();
    const file = new File(["x"], "a.jpg", { type: "image/jpeg" });
    Object.defineProperty(file, "arrayBuffer", {
      configurable: true,
      value: () => new Promise(() => {}),
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const pending = snapshotFile(file);
    const assertion = expect(pending).rejects.toBeInstanceOf(LocalFileError);
    await vi.advanceTimersByTimeAsync(DECODE_TIMEOUT_MS);
    await assertion;
    errorSpy.mockRestore();
  });
});

describe("isLocalFileFailure", () => {
  it("treats unreadable picker files as per-file, not as a dead server", () => {
    expect(isLocalFileFailure(new LocalFileError("a.heif"))).toBe(true);
    expect(isLocalFileFailure(new DOMException("locked", "NotReadableError"))).toBe(true);
    expect(
      isLocalFileFailure(
        new TypeError("The requested file could not be read, typically due to permission problems."),
      ),
    ).toBe(true);
    expect(isLocalFileFailure(new Error("network down"))).toBe(false);
    expect(isLocalFileFailure(new TypeError("Failed to fetch"))).toBe(false);
  });
});
