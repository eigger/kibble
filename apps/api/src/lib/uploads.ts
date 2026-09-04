import { unlink } from "node:fs/promises";
import path from "node:path";

export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

/** 청크 업로드 임시 조각 — UPLOAD_DIR과 같은 파일시스템에 두어 complete 시 rename 가능 */
export const TEMP_DIR = path.join(UPLOAD_DIR, "tmp");

/**
 * 청크 업로드 총 파일 상한 (기본 150MB). multipart 단건은 별도 20MB 제한 유지.
 *
 * 500MB였을 때 실제로 벌어진 일: 384MB 영상이 8MB 청크로 수십 분을 올라가다 중간에
 * 끊겨 `tmp/`에 조각만 남았다. 상한이 허용하는 크기와 **끝까지 올릴 수 있는 크기**가
 * 달랐던 것이다. 상한을 낮추면 init 단계에서 즉시 413으로 막혀 사용자가 20분을 버리는
 * 대신 곧바로 이유를 안다. 더 큰 파일이 필요한 설치는 FILE_SIZE_LIMIT_MB로 올린다.
 *
 * 150MB면 1080p 30fps 기준 약 2분, 4K 30fps 기준 약 40초다 — 일지용 클립에는 충분하다.
 */
export const FILE_SIZE_LIMIT_BYTES = Number(process.env.FILE_SIZE_LIMIT_MB ?? 150) * 1024 * 1024;

// 파일이 이미 없어도(수동 삭제 등) 조용히 넘어간다 — DB 정리가 목적이지 파일 존재를
// 보장하는 게 목적이 아니다.
export async function deleteUploadedFile(storedName: string): Promise<void> {
  await unlink(path.join(UPLOAD_DIR, storedName)).catch(() => {});
}
