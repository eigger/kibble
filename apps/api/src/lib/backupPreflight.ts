import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir, stat, statfs } from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);

/** 여유 공간은 원본의 이 배수만큼 필요하다 — files/ 복사본 + tar.gz 한 벌 */
const SPACE_MULTIPLIER = 2;
/** 디렉터리 순회 상한. 첨부가 아주 많아도 프리플라이트가 오래 걸리면 안 된다 */
const MAX_WALK_ENTRIES = 50_000;

export type BackupPreflightCheck = {
  name: "tar" | "uploadDir" | "diskSpace";
  ok: boolean;
  /** 사람이 읽을 사유. 통과했으면 비어 있다 */
  detail?: string;
};

export type BackupPreflightResult = {
  ok: boolean;
  checks: BackupPreflightCheck[];
  /** uploads 원본 크기 합. 아카이브는 압축되므로 이보다 작다 */
  sourceBytes: number;
  fileCount: number;
  freeBytes: number | null;
};

/** UPLOAD_DIR 원본 크기. 작업 디렉터리와 이전 아카이브는 백업 대상이 아니므로 뺀다. */
export async function measureUploads(
  uploadDir: string,
): Promise<{ sourceBytes: number; fileCount: number }> {
  let sourceBytes = 0;
  let fileCount = 0;
  let visited = 0;

  async function walk(dir: string, top: boolean): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (visited >= MAX_WALK_ENTRIES) return;
      visited += 1;
      if (top) {
        if (entry.name === "tmp") continue;
        if (entry.isDirectory() && /^(backup|restore)_/.test(entry.name)) continue;
        if (entry.isFile() && entry.name.endsWith(".tar.gz")) continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, false);
      } else if (entry.isFile()) {
        try {
          const info = await stat(full);
          sourceBytes += info.size;
          fileCount += 1;
        } catch {
          /* 순회 중 사라진 파일은 센다고 얻을 게 없다 */
        }
      }
    }
  }

  await walk(uploadDir, true);
  return { sourceBytes, fileCount };
}

/**
 * 내보내기가 실패할 만한 조건을 미리 본다.
 *
 * 내보내기는 새 탭이 받아 가므로 앱이 실패를 볼 방법이 없다 — 화면에는 아무 일도 안
 * 일어난다. 눌러서 실패하기 전에, 앱 안에서 말이 되는 이유를 먼저 보여주려는 것이다.
 */
export async function runBackupPreflight(uploadDir: string): Promise<BackupPreflightResult> {
  const checks: BackupPreflightCheck[] = [];

  // tar는 Alpine에서 busybox가 준다. 이미지가 바뀌면 조용히 사라질 수 있다.
  try {
    await execFileAsync("tar", ["--version"], { timeout: 5_000 });
    checks.push({ name: "tar", ok: true });
  } catch (err) {
    checks.push({
      name: "tar",
      ok: false,
      detail: `tar is not usable: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`,
    });
  }

  let uploadDirOk = false;
  try {
    const info = await stat(uploadDir);
    uploadDirOk = info.isDirectory();
    checks.push({
      name: "uploadDir",
      ok: uploadDirOk,
      detail: uploadDirOk ? undefined : `${uploadDir} is not a directory`,
    });
  } catch (err) {
    checks.push({
      name: "uploadDir",
      ok: false,
      detail: `${uploadDir} is unreadable: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`,
    });
  }

  const { sourceBytes, fileCount } = uploadDirOk
    ? await measureUploads(uploadDir)
    : { sourceBytes: 0, fileCount: 0 };

  let freeBytes: number | null;
  try {
    const fs = await statfs(uploadDir);
    freeBytes = Number(fs.bavail) * Number(fs.bsize);
  } catch {
    freeBytes = null;
  }

  const needed = sourceBytes * SPACE_MULTIPLIER;
  if (freeBytes === null) {
    // 여유 공간을 못 재는 환경이면 막지 않는다 — 모르는 것과 부족한 것은 다르다 (K-12).
    checks.push({ name: "diskSpace", ok: true, detail: "free space is unknown" });
  } else {
    const ok = freeBytes >= needed;
    checks.push({
      name: "diskSpace",
      ok,
      detail: ok
        ? undefined
        : `needs about ${mib(needed)} free (copy + archive) but only ${mib(freeBytes)} is available`,
    });
  }

  return { ok: checks.every((c) => c.ok), checks, sourceBytes, fileCount, freeBytes };
}

function mib(bytes: number): string {
  return `${Math.ceil(bytes / 1024 / 1024)}MB`;
}
