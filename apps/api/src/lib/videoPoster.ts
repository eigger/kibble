import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { TEMP_DIR } from "./uploads.js";

const execFileAsync = promisify(execFile);

/** 손상된 파일이 API를 붙잡고 있으면 안 된다 */
const FFMPEG_TIMEOUT_MS = 20_000;

let missingBinaryLogged = false;

/**
 * 영상에서 대표 프레임 한 장을 JPEG로 뽑는다.
 *
 * **재인코딩이 아니다.** 프레임 하나 추출은 수백 ms로 끝나 업로드 응답 안에서 동기로
 * 해도 된다 — 영상 전체 트랜스코딩(분 단위, 큐·워커 필요)과는 비용이 다르다.
 *
 * 목록에서 `<video>` 대신 이 포스터를 `<img>`로 쓰면 타임라인이 영상 바이트를 한
 * 바이트도 받지 않는다. 그게 이 함수의 존재 이유다.
 *
 * ffmpeg가 없거나 실패하면 **null을 돌려주고 업로드는 그대로 진행한다** (K-12).
 * 포스터는 있으면 좋은 것이지 첨부의 조건이 아니다.
 *
 * 출력은 파이프가 아니라 `.jpg` 임시 파일로 받는다 — 확장자로 먹서를 고르게 하는 쪽이
 * `-f image2 pipe:1`보다 ffmpeg 버전에 덜 민감하다.
 */
export async function extractVideoPoster(videoPath: string): Promise<Buffer | null> {
  const outPath = path.join(TEMP_DIR, `poster-${randomUUID()}.jpg`);

  try {
    await mkdir(TEMP_DIR, { recursive: true });
    await execFileAsync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        videoPath,
        // thumbnail 필터가 앞부분을 훑어 대표 프레임을 고른다 — 첫 프레임을 그냥 쓰면
        // 검은 화면이 잡히는 영상이 많다.
        "-vf",
        "thumbnail",
        "-frames:v",
        "1",
        outPath,
      ],
      { timeout: FFMPEG_TIMEOUT_MS, windowsHide: true },
    );
    const frame = await readFile(outPath);
    return frame.length > 0 ? frame : null;
  } catch (err) {
    // ffmpeg가 아예 없는 설치(로컬 개발 등)에서는 업로드마다 시끄러울 이유가 없다.
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT" && !missingBinaryLogged) {
      missingBinaryLogged = true;
      console.warn("[videoPoster] ffmpeg not found — video attachments will have no poster");
      return null;
    }
    // 그 밖의 실패는 남긴다. 조용히 null이 되면 포스터 기능이 죽은 걸 아무도 모른다.
    const detail = err instanceof Error ? err.message.slice(0, 300) : String(err);
    console.warn(`[videoPoster] poster extraction failed: ${detail}`);
    return null;
  } finally {
    await unlink(outPath).catch(() => {});
  }
}
