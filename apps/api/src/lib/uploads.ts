import { unlink } from "node:fs/promises";
import path from "node:path";

export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

/** 청크 업로드 임시 조각 — UPLOAD_DIR과 같은 파일시스템에 두어 complete 시 rename 가능 */
export const TEMP_DIR = path.join(UPLOAD_DIR, "tmp");

/** 청크 업로드 총 파일 상한 (기본 500MB). multipart 단건은 별도 20MB 제한 유지 */
export const FILE_SIZE_LIMIT_BYTES = Number(process.env.FILE_SIZE_LIMIT_MB ?? 500) * 1024 * 1024;

// 파일이 이미 없어도(수동 삭제 등) 조용히 넘어간다 — DB 정리가 목적이지 파일 존재를
// 보장하는 게 목적이 아니다.
export async function deleteUploadedFile(storedName: string): Promise<void> {
  await unlink(path.join(UPLOAD_DIR, storedName)).catch(() => {});
}
