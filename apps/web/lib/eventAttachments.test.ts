import { beforeEach, describe, expect, it, vi } from "vitest";
import { uploadEventAttachments } from "./eventAttachments";
import type { EventAttachment } from "./types";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, API_URL: "http://localhost:8080", apiJson: vi.fn(), apiFetch: vi.fn() };
});

vi.mock("./uploadPrep", async () => {
  const actual = await vi.importActual<typeof import("./uploadPrep")>("./uploadPrep");
  return {
    ...actual,
    prepareAttachmentForUpload: vi.fn(actual.prepareAttachmentForUpload),
  };
});

import { ApiError, apiJson } from "./api";
import { LocalFileError, prepareAttachmentForUpload } from "./uploadPrep";

function attachment(id: string): EventAttachment {
  return { id, path: `events/${id}.jpg`, mime: "image/jpeg", size: 1, width: 1, height: 1 } as EventAttachment;
}

describe("uploadEventAttachments", () => {
  beforeEach(() => {
    vi.mocked(apiJson).mockReset();
    vi.mocked(prepareAttachmentForUpload).mockReset();
    vi.mocked(prepareAttachmentForUpload).mockImplementation(async (file) => file);
  });

  const files = () => [
    new File(["a"], "a.jpg", { type: "image/jpeg" }),
    new File(["b"], "b.jpg", { type: "image/jpeg" }),
    new File(["c"], "c.jpg", { type: "image/jpeg" }),
  ];

  it("stops on a transient failure and returns the untried files", async () => {
    vi.mocked(apiJson)
      .mockResolvedValueOnce(attachment("att1"))
      .mockRejectedValueOnce(new Error("network down"));

    const result = await uploadEventAttachments("evt1", files());

    expect(result.uploaded.map((a) => a.id)).toEqual(["att1"]);
    expect(result.remaining.map((f) => f.name)).toEqual(["b.jpg", "c.jpg"]);
  });

  // 용량 초과 영상 하나가 뒤따르는 사진 전부를 막던 구멍 — 413·415는 파일 하나의
  // 문제이지 서버·회선의 문제가 아니다
  it("keeps going past an oversized file", async () => {
    vi.mocked(apiJson)
      .mockResolvedValueOnce(attachment("att1"))
      .mockRejectedValueOnce(new ApiError("파일이 너무 큽니다", 413))
      .mockResolvedValueOnce(attachment("att3"));

    const result = await uploadEventAttachments("evt1", files());

    expect(result.uploaded.map((a) => a.id)).toEqual(["att1", "att3"]);
    expect(result.remaining.map((f) => f.name)).toEqual(["b.jpg"]);
  });

  // 한 장이 형식 문제로 거부됐다고 나머지를 건너뛰면 "다중 업로드가 안 되는" 것처럼 보인다
  it("keeps going past a per-file rejection", async () => {
    vi.mocked(apiJson)
      .mockRejectedValueOnce(new ApiError("지원하지 않는 파일 형식", 400))
      .mockResolvedValueOnce(attachment("att2"))
      .mockResolvedValueOnce(attachment("att3"));

    const result = await uploadEventAttachments("evt1", files());

    expect(result.uploaded.map((a) => a.id)).toEqual(["att2", "att3"]);
    expect(result.remaining.map((f) => f.name)).toEqual(["a.jpg"]);
  });

  // 갤럭시 다중 선택에서 2장째 content URI가 끊겨도, 네트워크가 죽은 것처럼
  // 나머지를 건너뛰면 "한 장만 올라간다"로 보인다
  it("keeps going past an unreadable file", async () => {
    vi.mocked(prepareAttachmentForUpload)
      .mockResolvedValueOnce(files()[0])
      .mockRejectedValueOnce(new LocalFileError("b.jpg"))
      .mockResolvedValueOnce(files()[2]);
    vi.mocked(apiJson)
      .mockResolvedValueOnce(attachment("att1"))
      .mockResolvedValueOnce(attachment("att3"));

    const result = await uploadEventAttachments("evt1", files());

    expect(result.uploaded.map((a) => a.id)).toEqual(["att1", "att3"]);
    expect(result.remaining.map((f) => f.name)).toEqual(["b.jpg"]);
  });

  it("keeps going when fetch wraps NotReadableError as TypeError", async () => {
    vi.mocked(apiJson)
      .mockResolvedValueOnce(attachment("att1"))
      .mockRejectedValueOnce(
        new TypeError("The requested file could not be read, typically due to permission problems."),
      )
      .mockResolvedValueOnce(attachment("att3"));

    const result = await uploadEventAttachments("evt1", files());

    expect(result.uploaded.map((a) => a.id)).toEqual(["att1", "att3"]);
    expect(result.remaining.map((f) => f.name)).toEqual(["b.jpg"]);
  });

  it("reports per-file progress", async () => {
    vi.mocked(apiJson)
      .mockResolvedValueOnce(attachment("att1"))
      .mockResolvedValueOnce(attachment("att2"));

    const seen: string[] = [];
    await uploadEventAttachments("evt1", files().slice(0, 2), (p) => {
      seen.push(`${p.fileIndex}:${p.phase}:${p.fileCount}`);
    });

    expect(seen.some((s) => s === "0:preparing:2")).toBe(true);
    expect(seen.some((s) => s === "0:uploading:2")).toBe(true);
    expect(seen.some((s) => s === "1:preparing:2")).toBe(true);
  });
});
