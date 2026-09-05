import { describe, expect, it } from "vitest";
import {
  parseFfprobeJson,
  shouldSkipVideoTranscode,
  transcodeFfmpegArgs,
  transcodeTimeoutMs,
} from "./videoTranscode.js";

describe("shouldSkipVideoTranscode", () => {
  it("skips files at or under 8MB", () => {
    expect(
      shouldSkipVideoTranscode({
        width: 3840,
        height: 2160,
        sizeBytes: 8 * 1024 * 1024,
        durationSec: 2,
      }),
    ).toBe(true);
  });

  it("does not skip a 15s 4K clip at ~30Mbps (R64 example)", () => {
    expect(
      shouldSkipVideoTranscode({
        width: 3840,
        height: 2160,
        sizeBytes: 56 * 1024 * 1024,
        durationSec: 15,
      }),
    ).toBe(false);
  });

  it("skips when bitrate is already at or below 2Mbps even at 1080p", () => {
    // 10MB / 50s = 1.6Mbps
    expect(
      shouldSkipVideoTranscode({
        width: 1920,
        height: 1080,
        sizeBytes: 10 * 1024 * 1024,
        durationSec: 50,
      }),
    ).toBe(true);
  });

  it("skips 720p at or under 2.5Mbps", () => {
    // 11MiB / 40s ≈ 2.31Mbps, edge 1280
    expect(
      shouldSkipVideoTranscode({
        width: 1280,
        height: 720,
        sizeBytes: 11 * 1024 * 1024,
        durationSec: 40,
      }),
    ).toBe(true);
  });

  it("transcodes 720p that is still too fat", () => {
    // 20MB / 15s = 10.7Mbps
    expect(
      shouldSkipVideoTranscode({
        width: 1280,
        height: 720,
        sizeBytes: 20 * 1024 * 1024,
        durationSec: 15,
      }),
    ).toBe(false);
  });

  it("transcodes 1080p above 2Mbps", () => {
    // 10MB / 30s = 2.67Mbps, edge 1920
    expect(
      shouldSkipVideoTranscode({
        width: 1920,
        height: 1080,
        sizeBytes: 10 * 1024 * 1024,
        durationSec: 30,
      }),
    ).toBe(false);
  });

  it("does not skip a large file with unknown duration", () => {
    expect(
      shouldSkipVideoTranscode({
        width: 3840,
        height: 2160,
        sizeBytes: 50 * 1024 * 1024,
        durationSec: null,
      }),
    ).toBe(false);
  });

  it("does not treat codec as a skip signal — probe codec is ignored", () => {
    // same numbers as the 4K clip; HEVC vs H.264 must not matter
    expect(
      shouldSkipVideoTranscode({
        width: 3840,
        height: 2160,
        sizeBytes: 56 * 1024 * 1024,
        durationSec: 15,
      }),
    ).toBe(false);
  });
});

describe("parseFfprobeJson", () => {
  it("reads width height duration from the video stream", () => {
    const probe = parseFfprobeJson(
      JSON.stringify({
        format: { duration: "15.02" },
        streams: [
          { codec_type: "audio", codec_name: "aac" },
          { codec_type: "video", codec_name: "hevc", width: 3840, height: 2160, duration: "15.00" },
        ],
      }),
    );
    expect(probe).toEqual({
      width: 3840,
      height: 2160,
      durationSec: 15,
      codec: "hevc",
    });
  });

  it("falls back to format duration", () => {
    const probe = parseFfprobeJson(
      JSON.stringify({
        format: { duration: "8.5" },
        streams: [{ codec_type: "video", codec_name: "h264", width: 1280, height: 720 }],
      }),
    );
    expect(probe?.durationSec).toBe(8.5);
  });

  it("returns null without a video stream", () => {
    expect(parseFfprobeJson(JSON.stringify({ streams: [{ codec_type: "audio" }] }))).toBeNull();
    expect(parseFfprobeJson("not-json")).toBeNull();
  });
});

describe("transcodeTimeoutMs", () => {
  it("clamps to 2 minutes minimum and 15 minutes maximum", () => {
    expect(transcodeTimeoutMs(1)).toBe(120_000);
    expect(transcodeTimeoutMs(60)).toBe(480_000);
    expect(transcodeTimeoutMs(10_000)).toBe(15 * 60_000);
    expect(transcodeTimeoutMs(null)).toBe(480_000);
  });
});

describe("transcodeFfmpegArgs", () => {
  it("forces 8-bit yuv420p so iPhone HDR does not become High 10", () => {
    const args = transcodeFfmpegArgs("/in.mov", "/out.mp4");
    const pix = args.indexOf("-pix_fmt");
    expect(pix).toBeGreaterThan(-1);
    expect(args[pix + 1]).toBe("yuv420p");
    expect(args.indexOf("-c:v")).toBeGreaterThan(pix);
  });
});
