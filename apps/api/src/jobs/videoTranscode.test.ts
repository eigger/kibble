import { describe, expect, it, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  attachment: {
    updateMany: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
  },
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
}));

const mockProbe = vi.hoisted(() => ({
  probeVideo: vi.fn(),
  transcodeVideoTo720p: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));
const mockPoster = vi.hoisted(() => ({ savePosterForVideo: vi.fn(async () => null as string | null) }));

vi.mock("../lib/eventAttachment.js", () => ({
  attachmentAbsolutePath: (rel: string) => `/abs/${rel}`,
  savePosterForVideo: mockPoster.savePosterForVideo,
}));
vi.mock("../lib/uploads.js", () => ({
  TEMP_DIR: "/tmp/kibble-transcode-test",
}));
vi.mock("../lib/videoTranscode.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/videoTranscode.js")>(
    "../lib/videoTranscode.js",
  );
  return {
    ...actual,
    probeVideo: mockProbe.probeVideo,
    transcodeVideoTo720p: mockProbe.transcodeVideoTo720p,
  };
});

import {
  backfillMissingPosters,
  recoverStuckProcessing,
  requeueFailedTranscodes,
  transcodeClaimedAttachment,
  MAX_TRANSCODE_ATTEMPTS,
} from "./videoTranscode.js";
import { TRANSCODE_STATUS } from "../lib/videoTranscode.js";

describe("videoTranscode job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPoster.savePosterForVideo.mockResolvedValue(null);
  });

  it("requeues processing rows on startup", async () => {
    mockPrisma.attachment.updateMany.mockResolvedValue({ count: 2 });
    await expect(recoverStuckProcessing()).resolves.toBe(2);
    expect(mockPrisma.attachment.updateMany).toHaveBeenCalledWith({
      where: { transcodeStatus: TRANSCODE_STATUS.PROCESSING },
      data: { transcodeStatus: TRANSCODE_STATUS.PENDING },
    });
  });

  // ffmpeg가 컨테이너째 죽이면 실패 처리 코드가 안 돈다 — 기동마다 되살아나
  // 또 죽는 고리가 됐다. 남은 기회가 없는 행은 되돌리지 않고 굳힌다.
  it("seals exhausted processing rows instead of retrying forever", async () => {
    mockPrisma.attachment.updateMany.mockResolvedValue({ count: 0 });
    await recoverStuckProcessing();
    expect(mockPrisma.attachment.updateMany).toHaveBeenCalledWith({
      where: {
        transcodeStatus: TRANSCODE_STATUS.PROCESSING,
        transcodeAttempts: { gte: MAX_TRANSCODE_ATTEMPTS },
      },
      data: { transcodeStatus: TRANSCODE_STATUS.FAILED },
    });
  });

  it("requeues failed videos only while attempts remain", async () => {
    mockPrisma.attachment.updateMany.mockResolvedValue({ count: 3 });
    await expect(requeueFailedTranscodes()).resolves.toBe(3);
    expect(mockPrisma.attachment.updateMany).toHaveBeenCalledWith({
      where: {
        transcodeStatus: TRANSCODE_STATUS.FAILED,
        transcodeAttempts: { lt: MAX_TRANSCODE_ATTEMPTS },
      },
      data: { transcodeStatus: TRANSCODE_STATUS.PENDING },
    });
  });

  it("marks already-small videos skipped without ffmpeg", async () => {
    mockProbe.probeVideo.mockResolvedValue({
      width: 1280,
      height: 720,
      durationSec: 50,
      codec: "h264",
    });
    mockPrisma.attachment.updateMany.mockResolvedValue({ count: 1 });

    await transcodeClaimedAttachment({
      id: "att1",
      path: "events/clip.mp4",
      size: 10 * 1024 * 1024,
      eventId: "evt1",
    });

    expect(mockProbe.transcodeVideoTo720p).not.toHaveBeenCalled();
    expect(mockPrisma.attachment.updateMany).toHaveBeenCalledWith({
      where: { id: "att1", transcodeStatus: TRANSCODE_STATUS.PROCESSING },
      data: {
        transcodeStatus: TRANSCODE_STATUS.SKIPPED,
        width: 1280,
        height: 720,
      },
    });
  });

  it("skips when ffprobe is missing so the queue does not retry forever", async () => {
    mockProbe.probeVideo.mockResolvedValue(null);
    mockPrisma.attachment.updateMany.mockResolvedValue({ count: 1 });

    await transcodeClaimedAttachment({
      id: "att2",
      path: "events/clip.mp4",
      size: 50 * 1024 * 1024,
      eventId: "evt1",
    });

    expect(mockProbe.transcodeVideoTo720p).not.toHaveBeenCalled();
    expect(mockPrisma.attachment.updateMany).toHaveBeenCalledWith({
      where: { id: "att2", transcodeStatus: TRANSCODE_STATUS.PROCESSING },
      data: {
        transcodeStatus: TRANSCODE_STATUS.SKIPPED,
      },
    });
  });

  it("attaches the poster before transcoding, so a transcode failure still leaves a thumbnail", async () => {
    mockPoster.savePosterForVideo.mockResolvedValue("events/evt1-poster.jpg");
    mockProbe.probeVideo.mockResolvedValue({
      width: 3840,
      height: 2160,
      durationSec: 120,
      codec: "hevc",
    });
    mockProbe.transcodeVideoTo720p.mockRejectedValue(new Error("ffmpeg timeout after 900000ms"));
    mockPrisma.attachment.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      transcodeClaimedAttachment({
        id: "att3",
        path: "events/big.mp4",
        size: 400 * 1024 * 1024,
        eventId: "evt1",
      }),
    ).rejects.toThrow(/ffmpeg timeout/);

    // 원본에서 뽑았고, 변환이 죽기 전에 붙었다
    expect(mockPoster.savePosterForVideo).toHaveBeenCalledWith("evt1", "/abs/events/big.mp4");
    expect(mockPrisma.attachment.updateMany).toHaveBeenCalledWith({
      where: { id: "att3", posterPath: null },
      data: { posterPath: "events/evt1-poster.jpg" },
    });
  });

  it("does not overwrite a poster that is already attached", async () => {
    mockPoster.savePosterForVideo.mockResolvedValue("events/evt1-poster.jpg");
    mockProbe.probeVideo.mockResolvedValue({
      width: 1280,
      height: 720,
      durationSec: 50,
      codec: "h264",
    });
    // 첫 호출(포스터 연결)은 0건 — 이미 붙어 있다. 두 번째(상태 표시)는 1건.
    mockPrisma.attachment.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValue({ count: 1 });

    await transcodeClaimedAttachment({
      id: "att4",
      path: "events/clip.mp4",
      size: 4 * 1024 * 1024,
      eventId: "evt1",
    });

    expect(mockPrisma.attachment.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "att4", posterPath: null },
      data: { posterPath: "events/evt1-poster.jpg" },
    });
  });

  it("backfills videos that finished without a poster", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { id: "old1", path: "events/old.mp4", size: 99, eventId: "evtOld" },
    ]);
    mockPoster.savePosterForVideo.mockResolvedValue("events/evtOld-poster.jpg");
    mockPrisma.attachment.updateMany.mockResolvedValue({ count: 1 });

    await expect(backfillMissingPosters()).resolves.toBe(1);
    expect(mockPoster.savePosterForVideo).toHaveBeenCalledWith("evtOld", "/abs/events/old.mp4");
    expect(mockPrisma.attachment.updateMany).toHaveBeenCalledWith({
      where: { id: "old1", posterPath: null },
      data: { posterPath: "events/evtOld-poster.jpg" },
    });
  });
});
