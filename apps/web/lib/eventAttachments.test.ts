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
});
