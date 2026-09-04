import { beforeEach, describe, expect, it, vi } from "vitest";
import { ATTACHMENT_UPLOAD_CONCURRENCY, uploadEventAttachments } from "./eventAttachments";
import type { EventAttachment } from "./types";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return {
    ...actual,
    API_URL: "http://localhost:8080",
    apiJson: vi.fn(),
    apiFormUpload: vi.fn(),
  };
});

vi.mock("./uploadPrep", async () => {
  const actual = await vi.importActual<typeof import("./uploadPrep")>("./uploadPrep");
  return {
    ...actual,
    prepareAttachmentForUpload: vi.fn(actual.prepareAttachmentForUpload),
  };
});

import { ApiError, apiFormUpload } from "./api";
import { LocalFileError, prepareAttachmentForUpload } from "./uploadPrep";

function attachment(id: string): EventAttachment {
  return { id, path: `events/${id}.jpg`, mime: "image/jpeg", size: 1, width: 1, height: 1 } as EventAttachment;
}

function fileOf(formData: FormData): File {
  return formData.get("file") as File;
}

describe("uploadEventAttachments", () => {
  beforeEach(() => {
    vi.mocked(apiFormUpload).mockReset();
    vi.mocked(prepareAttachmentForUpload).mockReset();
    vi.mocked(prepareAttachmentForUpload).mockImplementation(async (file) => file);
  });

  const files = () => [
    new File(["a"], "a.jpg", { type: "image/jpeg" }),
    new File(["b"], "b.jpg", { type: "image/jpeg" }),
    new File(["c"], "c.jpg", { type: "image/jpeg" }),
  ];

  it("uploads several files at once", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    vi.mocked(apiFormUpload).mockImplementation(async (_path, formData) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlight -= 1;
      return attachment(fileOf(formData).name);
    });

    const result = await uploadEventAttachments("evt1", files());

    expect(maxInFlight).toBe(ATTACHMENT_UPLOAD_CONCURRENCY);
    expect(result.uploaded).toHaveLength(3);
    expect(result.remaining).toHaveLength(0);
  });

  it("does not start more files after a transient failure", async () => {
    const many = [
      ...files(),
      new File(["d"], "d.jpg", { type: "image/jpeg" }),
      new File(["e"], "e.jpg", { type: "image/jpeg" }),
    ];
    vi.mocked(apiFormUpload).mockImplementation(async (_path, formData) => {
      const file = fileOf(formData);
      if (file.name === "b.jpg") throw new Error("network down");
      await new Promise((resolve) => setTimeout(resolve, 20));
      return attachment(file.name);
    });

    const result = await uploadEventAttachments("evt1", many);

    expect(result.uploaded.map((a) => a.id).sort()).toEqual(["a.jpg", "c.jpg"]);
    expect(result.remaining.map((f) => f.name)).toEqual(["b.jpg", "d.jpg", "e.jpg"]);
  });

  // 용량 초과 영상 하나가 뒤따르는 사진 전부를 막던 구멍 — 413·415는 파일 하나의
  // 문제이지 서버·회선의 문제가 아니다
  it("keeps going past an oversized file", async () => {
    vi.mocked(apiFormUpload).mockImplementation(async (_path, formData) => {
      const file = fileOf(formData);
      if (file.name === "b.jpg") throw new ApiError("파일이 너무 큽니다", 413);
      return attachment(file.name);
    });

    const result = await uploadEventAttachments("evt1", files());

    expect(result.uploaded.map((a) => a.id).sort()).toEqual(["a.jpg", "c.jpg"]);
    expect(result.remaining.map((f) => f.name)).toEqual(["b.jpg"]);
  });

  // 한 장이 형식 문제로 거부됐다고 나머지를 건너뛰면 "다중 업로드가 안 되는" 것처럼 보인다
  it("keeps going past a per-file rejection", async () => {
    vi.mocked(apiFormUpload).mockImplementation(async (_path, formData) => {
      const file = fileOf(formData);
      if (file.name === "a.jpg") throw new ApiError("지원하지 않는 파일 형식", 400);
      return attachment(file.name);
    });

    const result = await uploadEventAttachments("evt1", files());

    expect(result.uploaded.map((a) => a.id).sort()).toEqual(["b.jpg", "c.jpg"]);
    expect(result.remaining.map((f) => f.name)).toEqual(["a.jpg"]);
  });

  // 갤럭시 다중 선택에서 2장째 content URI가 끊겨도, 네트워크가 죽은 것처럼
  // 나머지를 건너뛰면 "한 장만 올라간다"로 보인다
  it("keeps going past an unreadable file", async () => {
    vi.mocked(prepareAttachmentForUpload).mockImplementation(async (file) => {
      if (file.name === "b.jpg") throw new LocalFileError("b.jpg");
      return file;
    });
    vi.mocked(apiFormUpload).mockImplementation(async (_path, formData) => attachment(fileOf(formData).name));

    const result = await uploadEventAttachments("evt1", files());

    expect(result.uploaded.map((a) => a.id).sort()).toEqual(["a.jpg", "c.jpg"]);
    expect(result.remaining.map((f) => f.name)).toEqual(["b.jpg"]);
  });

  it("keeps going when fetch wraps NotReadableError as TypeError", async () => {
    vi.mocked(apiFormUpload).mockImplementation(async (_path, formData) => {
      const file = fileOf(formData);
      if (file.name === "b.jpg") {
        throw new TypeError("The requested file could not be read, typically due to permission problems.");
      }
      return attachment(file.name);
    });

    const result = await uploadEventAttachments("evt1", files());

    expect(result.uploaded.map((a) => a.id).sort()).toEqual(["a.jpg", "c.jpg"]);
    expect(result.remaining.map((f) => f.name)).toEqual(["b.jpg"]);
  });

  it("reports per-file progress including byte updates", async () => {
    vi.mocked(apiFormUpload).mockImplementation(async (_path, formData, onUploadProgress) => {
      const file = fileOf(formData);
      onUploadProgress?.(1, 10);
      onUploadProgress?.(10, 10);
      return attachment(file.name);
    });

    const ticks: string[] = [];
    await uploadEventAttachments("evt1", files().slice(0, 2), (p) => {
      p.fileStates.forEach((state, index) => {
        if (state.active || state.done) ticks.push(`${index}:${state.phase}:${state.loaded}:${state.done}`);
      });
    });

    expect(ticks.some((s) => s.startsWith("0:preparing:"))).toBe(true);
    expect(ticks.some((s) => s.startsWith("0:uploading:1:"))).toBe(true);
    expect(ticks.some((s) => s.startsWith("1:preparing:"))).toBe(true);
    expect(ticks.some((s) => s.startsWith("0:uploading:") && s.endsWith(":true"))).toBe(true);
  });
});
