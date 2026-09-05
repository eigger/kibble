import { unlink } from "node:fs/promises";
import path from "node:path";

export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

/** 청크 업로드 임시 조각 — UPLOAD_DIR과 같은 파일시스템에 두어 complete 시 rename 가능 */
export const TEMP_DIR = path.join(UPLOAD_DIR, "tmp");

/**
 * 청크 업로드 총 파일 상한 (기본 500MB). multipart 단건은 별도 20MB 제한 유지.
 *
 * 한동안 150MB로 낮췄던 이유(R68): 384MB가 중간에 끊겨 조각만 남았다. 지금은 세션이
 * 디스크에 남고 재개·이탈 경고·화면 유지가 있어, 원본 4K를 init 413으로 막는 쪽이
 * 더 아프다 (R79). 업로드 자체는 원본 크기이고, 큰 영상은 서버가 백그라운드에서
 * 720p로 줄인다.
 */
export const FILE_SIZE_LIMIT_BYTES = Number(process.env.FILE_SIZE_LIMIT_MB ?? 500) * 1024 * 1024;

// 파일이 이미 없어도(수동 삭제 등) 조용히 넘어간다 — DB 정리가 목적이지 파일 존재를
// 보장하는 게 목적이 아니다.
export async function deleteUploadedFile(storedName: string): Promise<void> {
  await unlink(path.join(UPLOAD_DIR, storedName)).catch(() => {});
}
