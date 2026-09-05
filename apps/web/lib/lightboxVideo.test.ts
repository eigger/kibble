import { describe, expect, it, vi } from "vitest";
import { startLightboxPlayback } from "./lightboxVideo";

describe("startLightboxPlayback", () => {
  it("소리 재생이 되면 playing", async () => {
    const el = { muted: false, play: vi.fn().mockResolvedValue(undefined) };
    await expect(startLightboxPlayback(el)).resolves.toBe("playing");
    expect(el.muted).toBe(false);
  });

  it("소리 재생이 막히면 무음으로 재시도한다", async () => {
    const el = {
      muted: false,
      play: vi
        .fn()
        .mockRejectedValueOnce(new DOMException("blocked", "NotAllowedError"))
        .mockResolvedValueOnce(undefined),
    };
    await expect(startLightboxPlayback(el)).resolves.toBe("muted");
    expect(el.muted).toBe(true);
    expect(el.play).toHaveBeenCalledTimes(2);
  });

  it("무음도 막히면 blocked", async () => {
    const el = { muted: false, play: vi.fn().mockRejectedValue(new Error("fail")) };
    await expect(startLightboxPlayback(el)).resolves.toBe("blocked");
  });
});
