import { existsSync } from "node:fs";
import { copyFile, link, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

/** 청크 업로드 중인 조각 — 완성되지 않은 쓰레기라 백업에 담지 않는다 */
const UPLOAD_TEMP_DIRNAME = "tmp";

/**
 * 백업·복원이 UPLOAD_DIR 안에 만드는 작업 디렉터리(`backup_<ts>` / `restore_<ts>`).
 * 정상 종료하면 지워지지만 프로세스가 중간에 죽으면 남는다 — 남은 걸 다음 아카이브에
 * 담으면 백업 안에 백업이 중첩된다. 이번에 고친 버그가 정확히 "디렉터리 취급을 빼먹음"
 * 이었으므로, 이제 디렉터리를 담게 된 만큼 무엇을 담지 **않을지**도 분명히 해 둔다.
 */
const WORK_DIR_PREFIXES = ["backup_", "restore_"];

function isWorkDir(name: string): boolean {
  return WORK_DIR_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/**
 * 업로드 디렉터리를 백업 아카이브의 files/ 아래로 복사한다.
 *
 * **재귀여야 한다.** 첨부는 `uploads/events/`, 펫 사진은 `uploads/pets/` — 둘 다
 * 디렉터리다. 예전에는 최상위 파일만 복사해서 사진·영상이 백업에 하나도 들어가지
 * 않았다 (파일이 UPLOAD_DIR 루트에 평평하게 있던 시절 코드가 그대로 남아 있었다).
 *
 * 한 파일씩 옮긴다. `cp -r` 한 방이 더 짧지만 그러면 **얼마나 갔는지 알 방법이 없다** —
 * 화면은 빌드가 끝날 때까지 아무 말도 못 한다. 진행률을 그리려고 파일 단위로 내려간다.
 *
 * **바이트를 복사하지 않는다 — 하드링크로 잇는다.** `files/`는 `UPLOAD_DIR` 안이라 항상
 * 같은 파일시스템이고, 링크는 크기와 무관하게 즉시다. 예전에는 진짜 사본이라 백업 한 번이
 * 원본만큼의 디스크를 더 먹었고(R125에서 찌꺼기를 걷어냈을 뿐 사본 자체는 남아 있었다),
 * 중복 제거로 하드링크된 첨부는 여기서 다시 풀려 **아카이브가 uploads보다 커졌다** (R132).
 *
 * 링크가 안 되는 환경(파일시스템이 지원하지 않거나 경계를 넘는 경우)에서는 조용히
 * 복사로 되돌아간다 — 백업이 되는 것이 먼저다 (K-12).
 *
 * @param skipDirName 이번 백업이 쓰고 있는 작업 디렉터리 — 자기 자신을 담지 않는다
 * @param onStaged 파일 하나를 담을 때마다 크기와 아카이브 안 상대 경로로 불린다.
 *   여기서 던지면 그 자리에서 멈춘다 — 취소는 그렇게 걸린다
 */
export async function copyUploadsForBackup(
  uploadDir: string,
  filesDir: string,
  skipDirName: string,
  onStaged?: (bytes: number, relativePath: string) => void,
): Promise<void> {
  if (!existsSync(uploadDir)) return;

  const entries = await readdir(uploadDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === skipDirName) continue;
    if (entry.name === UPLOAD_TEMP_DIRNAME) continue;
    if (entry.isDirectory() && isWorkDir(entry.name)) continue;
    // 이전 백업 아카이브를 백업에 다시 담지 않는다
    if (entry.isFile() && entry.name.endsWith(".tar.gz")) continue;
    if (!entry.isFile() && !entry.isDirectory()) continue;

    await stageTree(path.join(uploadDir, entry.name), path.join(filesDir, entry.name), entry.name, onStaged);
  }
}

/** 제외 규칙은 최상위에서만 본다 — 그 아래는 전부 사용자 파일이다 */
async function stageTree(
  source: string,
  dest: string,
  relativePath: string,
  onStaged?: (bytes: number, relativePath: string) => void,
): Promise<void> {
  const info = await stat(source);
  if (info.isFile()) {
    await mkdir(path.dirname(dest), { recursive: true });
    await linkOrCopy(source, dest);
    onStaged?.(info.size, relativePath);
    return;
  }
  if (!info.isDirectory()) return;

  await mkdir(dest, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    await stageTree(
      path.join(source, entry.name),
      path.join(dest, entry.name),
      `${relativePath}/${entry.name}`,
      onStaged,
    );
  }
}

async function linkOrCopy(source: string, dest: string): Promise<void> {
  try {
    await link(source, dest);
  } catch {
    await copyFile(source, dest);
  }
}

/**
 * 내보내기와 대칭 — 평평하게 복사하면 events/·pets/ 안의 사진·영상이 복원되지 않는다.
 *
 * 아카이브 안에서 같은 내용이던 파일들(중복 제거로 하드링크된 첨부)은 풀린 뒤에도
 * 여전히 한 아이노드를 가리킨다. `cp`는 그걸 모르고 한 벌씩 새로 쓴다 — 복원 한 번에
 * 중복 제거가 통째로 되돌아간다. 아이노드를 기억했다가 두 번째부터는 링크로 잇는다.
 */
export async function restoreUploadsFromBackup(
  filesDir: string,
  uploadDir: string,
): Promise<void> {
  if (!existsSync(filesDir)) return;

  const restoredByInode = new Map<string, string>();
  const entries = await readdir(filesDir, { withFileTypes: true });
  for (const entry of entries) {
    await restoreTree(
      path.join(filesDir, entry.name),
      path.join(uploadDir, entry.name),
      restoredByInode,
    );
  }
}

async function restoreTree(
  source: string,
  dest: string,
  restoredByInode: Map<string, string>,
): Promise<void> {
  const info = await stat(source);
  if (info.isDirectory()) {
    await mkdir(dest, { recursive: true });
    const entries = await readdir(source, { withFileTypes: true });
    for (const entry of entries) {
      await restoreTree(path.join(source, entry.name), path.join(dest, entry.name), restoredByInode);
    }
    return;
  }
  if (!info.isFile()) return;

  await mkdir(path.dirname(dest), { recursive: true });
  // 덮어쓰기다. 링크를 걸려면 자리가 비어 있어야 하고, 복사도 기존 아이노드에
  // 덧쓰는 대신 새로 만드는 편이 낫다 — 그 파일에 걸린 다른 이름을 건드리지 않는다.
  await rm(dest, { force: true }).catch(() => {});

  // nlink가 1이면 아카이브 안에서도 혼자였다 — 기억할 것이 없다.
  const key = info.nlink > 1 ? `${info.dev}:${info.ino}` : null;
  const already = key ? restoredByInode.get(key) : undefined;
  if (already) {
    try {
      await link(already, dest);
      return;
    } catch {
      // 링크가 안 되면 그냥 복사한다 — 용량만 손해지 내용은 같다
    }
  }

  await copyFile(source, dest);
  if (key) restoredByInode.set(key, dest);
}
