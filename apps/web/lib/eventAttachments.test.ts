import { beforeEach, describe, expect, it, vi } from "vitest";
import { uploadEventAttachments } from "./eventAttachments";
import type { EventAttachment } from "./types";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, API_URL: "http://localhost:8080", apiJson: vi.fn(), apiFetch: vi.fn() };
});

import { ApiError, apiJson } from "./api";

function attachment(id: string): EventAttachment {
  return { id, path: `events/${id}.jpg`, mime: "image/jpeg", size: 1, width: 1, height: 1 } as EventAttachment;
}

describe("uploadEventAttachments", () => {
  beforeEach(() => {
    vi.mocked(apiJson).mockReset();
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
