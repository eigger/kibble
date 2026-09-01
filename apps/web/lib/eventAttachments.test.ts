import { describe, expect, it, vi } from "vitest";
import { uploadEventAttachments } from "./eventAttachments";
import type { EventAttachment } from "./types";

vi.mock("./api", () => ({
  API_URL: "http://localhost:8080",
  apiJson: vi.fn(),
  apiFetch: vi.fn(),
}));

import { apiJson } from "./api";

describe("uploadEventAttachments", () => {
  it("returns remaining files after first failure without losing uploaded", async () => {
    const files = [
      new File(["a"], "a.jpg", { type: "image/jpeg" }),
      new File(["b"], "b.jpg", { type: "image/jpeg" }),
      new File(["c"], "c.jpg", { type: "image/jpeg" }),
    ];
    const attachment = { id: "att1", path: "events/a.jpg", mime: "image/jpeg", size: 1, width: 1, height: 1 };
    vi.mocked(apiJson)
      .mockResolvedValueOnce(attachment as EventAttachment)
      .mockRejectedValueOnce(new Error("fail"));

    const result = await uploadEventAttachments("evt1", files);

    expect(result.uploaded).toHaveLength(1);
    expect(result.uploaded[0].id).toBe("att1");
    expect(result.remaining).toHaveLength(2);
    expect(result.remaining[0].name).toBe("b.jpg");
  });
});
