import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractVideoPoster } from "./videoPoster.js";

/**
 * 포스터는 있으면 좋은 것이지 첨부의 조건이 아니다 (K-12). ffmpeg가 없는 설치도,
 * 깨진 파일도 업로드를 막아서는 안 된다 — 그 계약만 못박는다.
 * (실제 프레임 추출은 ffmpeg 유무에 따라 달라져 CI에서 검증하지 않는다)
 */
describe("extractVideoPoster", () => {
  let dir = "";

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "kibble-poster-"));
    // 실패 경로는 warn을 남긴다 — 테스트 출력만 조용히 시킨다
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  it("returns null for a file ffmpeg cannot decode", async () => {
    const fake = path.join(dir, "not-a-video.mp4");
    await writeFile(fake, "definitely not mpeg");
    await expect(extractVideoPoster(fake)).resolves.toBeNull();
  });

  it("returns null when the file does not exist", async () => {
    await expect(extractVideoPoster(path.join(dir, "missing.mp4"))).resolves.toBeNull();
  });
});
