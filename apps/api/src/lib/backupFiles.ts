import { existsSync } from "node:fs";
import { cp, readdir } from "node:fs/promises";
import path from "node:path";

/** 청크 업로드 중인 조각 — 완성되지 않은 쓰레기라 백업에 담지 않는다 */
const UPLOAD_TEMP_DIRNAME = "tmp";

/**
 * 업로드 디렉터리를 백업 아카이브의 files/ 아래로 복사한다.
 *
 * **재귀여야 한다.** 첨부는 `uploads/events/`, 펫 사진은 `uploads/pets/` — 둘 다
 * 디렉터리다. 예전에는 최상위 파일만 복사해서 사진·영상이 백업에 하나도 들어가지
 * 않았다 (파일이 UPLOAD_DIR 루트에 평평하게 있던 시절 코드가 그대로 남아 있었다).
 *
 * @param skipDirName 이번 백업이 쓰고 있는 작업 디렉터리 — 자기 자신을 담지 않는다
 */
export async function copyUploadsForBackup(
  uploadDir: string,
  filesDir: string,
  skipDirName: string,
): Promise<void> {
  if (!existsSync(uploadDir)) return;

  const entries = await readdir(uploadDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === skipDirName) continue;
    if (entry.name === UPLOAD_TEMP_DIRNAME) continue;
    // 이전 백업 아카이브를 백업에 다시 담지 않는다
    if (entry.isFile() && entry.name.endsWith(".tar.gz")) continue;
    if (!entry.isFile() && !entry.isDirectory()) continue;

    await cp(path.join(uploadDir, entry.name), path.join(filesDir, entry.name), {
      recursive: true,
    });
  }
}

/** 내보내기와 대칭 — 평평하게 복사하면 events/·pets/ 안의 사진·영상이 복원되지 않는다. */
export async function restoreUploadsFromBackup(
  filesDir: string,
  uploadDir: string,
): Promise<void> {
  if (!existsSync(filesDir)) return;

  const entries = await readdir(filesDir, { withFileTypes: true });
  for (const entry of entries) {
    await cp(path.join(filesDir, entry.name), path.join(uploadDir, entry.name), {
      recursive: true,
      force: true,
    });
  }
}
