import { describe, expect, it } from "vitest";
import { holdVideoThumbPlaceholder } from "./attachmentThumb";

describe("holdVideoThumbPlaceholder", () => {
  it("holds a pending video without a poster so the list does not fetch the original", () => {
    expect(
      holdVideoThumbPlaceholder({
        mime: "video/mp4",
        posterPath: null,
        transcodeStatus: "pending",
      }),
    ).toBe(true);
    expect(
      holdVideoThumbPlaceholder({
        mime: "video/mp4",
        posterPath: null,
        transcodeStatus: "processing",
      }),
    ).toBe(true);
  });

  it("does not hold playback, posters, or finished videos", () => {
    expect(
      holdVideoThumbPlaceholder({
        mime: "video/mp4",
        controls: true,
        transcodeStatus: "pending",
      }),
    ).toBe(false);
    expect(
      holdVideoThumbPlaceholder({
        mime: "video/mp4",
        posterPath: "events/p.jpg",
        transcodeStatus: "pending",
      }),
    ).toBe(false);
    expect(
      holdVideoThumbPlaceholder({
        mime: "video/mp4",
        transcodeStatus: "skipped",
      }),
    ).toBe(false);
    expect(holdVideoThumbPlaceholder({ mime: "image/jpeg", transcodeStatus: "pending" })).toBe(
      false,
    );
  });
});
