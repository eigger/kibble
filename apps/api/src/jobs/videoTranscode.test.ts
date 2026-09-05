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
vi.mock("../lib/eventAttachment.js", () => ({
  attachmentAbsolutePath: (rel: string) => `/abs/${rel}`,
  savePosterForVideo: vi.fn(async () => null),
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

import { recoverStuckProcessing, transcodeClaimedAttachment } from "./videoTranscode.js";
import { TRANSCODE_STATUS } from "../lib/videoTranscode.js";

describe("videoTranscode job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requeues processing rows on startup", async () => {
    mockPrisma.attachment.updateMany.mockResolvedValue({ count: 2 });
    await expect(recoverStuckProcessing()).resolves.toBe(2);
    expect(mockPrisma.attachment.updateMany).toHaveBeenCalledWith({
      where: { transcodeStatus: TRANSCODE_STATUS.PROCESSING },
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
});
