import { spawn, execFile } from "node:child_process";
import { setPriority } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { unlink } from "node:fs/promises";

const execFileAsync = promisify(execFile);

/** 손상된 파일이 API를 붙잡고 있으면 안 된다 — 포스터 추출과 같은 예산 */
const FFPROBE_TIMEOUT_MS = 20_000;

/** 목표 긴 변. 16:9면 1280×720 */
export const TRANSCODE_MAX_EDGE = 1280;
/** 720p 목표 비트레이트. 이미 이하면 재인코딩 이득이 없다 */
export const TRANSCODE_TARGET_BITRATE = 2_000_000;
/** 긴 변 ≤ 1280이면서 이 이하면 건너뛴다 */
export const SKIP_BITRATE = 2_500_000;
/** 이하면 해상도와 무관하게 재인코딩하지 않는다 */
export const SKIP_SIZE_BYTES = 8 * 1024 * 1024;

export const TRANSCODE_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  SKIPPED: "skipped",
  READY: "ready",
  FAILED: "failed",
} as const;

export type TranscodeStatus = (typeof TRANSCODE_STATUS)[keyof typeof TRANSCODE_STATUS];

export type VideoProbe = {
  width: number | null;
  height: number | null;
  durationSec: number | null;
  codec: string | null;
};

type FfprobeJson = {
  format?: { duration?: string };
  streams?: Array<{
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    duration?: string;
  }>;
};

function parsePositiveNumber(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** ffprobe JSON → 비디오 스트림 메타. 파싱 전용 — 테스트가 바이너리 없이 돌게. */
export function parseFfprobeJson(raw: string): VideoProbe | null {
  let parsed: FfprobeJson;
  try {
    parsed = JSON.parse(raw) as FfprobeJson;
  } catch {
    return null;
  }
  const video = parsed.streams?.find((stream) => stream.codec_type === "video");
  if (!video) return null;
  return {
    width: typeof video.width === "number" ? video.width : null,
    height: typeof video.height === "number" ? video.height : null,
    durationSec: parsePositiveNumber(video.duration) ?? parsePositiveNumber(parsed.format?.duration),
    codec: video.codec_name ?? null,
  };
}

/**
 * 이미 목표 프로필에 가깝면 재인코딩하지 않는다.
 *
 * "압축됐는가"는 코덱 플래그가 아니다. HEVC 4K도 video/mp4이고, 메신저 재공유도
 * 같다. 구분은 해상도 + 크기/길이로 구한 비트레이트다.
 */
export function shouldSkipVideoTranscode(input: {
  width: number | null;
  height: number | null;
  sizeBytes: number;
  durationSec: number | null;
}): boolean {
  if (input.sizeBytes <= SKIP_SIZE_BYTES) return true;

  const bitrate =
    input.durationSec && input.durationSec > 0 ? (input.sizeBytes * 8) / input.durationSec : null;
  if (bitrate != null && bitrate <= TRANSCODE_TARGET_BITRATE) return true;

  const edge =
    input.width != null && input.height != null ? Math.max(input.width, input.height) : null;
  if (edge != null && edge <= TRANSCODE_MAX_EDGE && bitrate != null && bitrate <= SKIP_BITRATE) {
    return true;
  }
  return false;
}

let missingFfprobeLogged = false;

export async function probeVideo(videoPath: string): Promise<VideoProbe | null> {
  try {
    const running = execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        videoPath,
      ],
      { timeout: FFPROBE_TIMEOUT_MS, windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
    );
    running.child.stdin?.end();
    const { stdout } = await running;
    return parseFfprobeJson(stdout);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT" && !missingFfprobeLogged) {
      missingFfprobeLogged = true;
      console.warn("[videoTranscode] ffprobe not found — videos will be stored as uploaded");
    }
    return null;
  }
}

/** 8×실시간, 하한 2분, 상한 15분. 작은 CT에서 4K 1분 인코딩이 수분 걸린다. */
export function transcodeTimeoutMs(durationSec: number | null): number {
  const estimated = Math.ceil(durationSec ?? 60) * 8 * 1000;
  return Math.min(15 * 60_000, Math.max(120_000, estimated));
}

function spawnWithTimeout(command: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    if (child.pid != null) {
      try {
        setPriority(child.pid, 15);
      } catch {
        // 윈도우·권한 — 우선순위는 최선이고, 못 낮춰도 변환 자체는 한다
      }
    }

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
      if (stderr.length > 2000) stderr = stderr.slice(-2000);
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`ffmpeg timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    child.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(0, 300)}`));
    });
  });
}

/**
 * 긴 변 1280 이하 H.264 + AAC. 출력은 mp4(+faststart).
 *
 * `-pix_fmt yuv420p`는 아이폰 HEVC 10-bit HDR 입력이 High 10으로 나가지 않게 한다.
 * 그 프로필은 브라우저가 못 여는 경우가 많고, 결과는 원본을 덮어쓰므로 되돌릴 수 없다.
 *
 * 요청 스레드에서 부르지 말 것 — 자식 프로세스라 이벤트 루프는 안 막히지만
 * 작은 CT CPU는 동시 1개로 제한해야 한다.
 */
export function transcodeFfmpegArgs(inputPath: string, outputPath: string): string[] {
  return [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    inputPath,
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-vf",
    "scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
    "-pix_fmt",
    "yuv420p",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    outputPath,
  ];
}

export async function transcodeVideoTo720p(
  inputPath: string,
  outputPath: string,
  timeoutMs: number,
): Promise<void> {
  await spawnWithTimeout("ffmpeg", transcodeFfmpegArgs(inputPath, outputPath), timeoutMs);
}

/** 변환본은 항상 mp4. .mov/.webm을 그대로 두면 백업을 풀었을 때 확장자가 거짓이다. */
export function transcodedRelativePath(originalRel: string): string {
  const ext = path.extname(originalRel);
  if (ext.toLowerCase() === ".mp4") return originalRel;
  if (!ext) return `${originalRel}.mp4`;
  return `${originalRel.slice(0, originalRel.length - ext.length)}.mp4`;
}

export async function unlinkQuiet(filePath: string): Promise<void> {
  await unlink(filePath).catch(() => {});
}
