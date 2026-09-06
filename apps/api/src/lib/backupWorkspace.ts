import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

/**
 * 백업·복원이 UPLOAD_DIR 안에 남긴 찌꺼기를 걷는다.
 *
 * 내보내기는 uploads 전체를 `backup_<ts>/files/`로 **복사한 뒤** `backup_<ts>.tar.gz`를
 * 만든다 — 한 번에 원본의 2배가 잠깐 잡힌다. 정상 종료하면 지워지지만, 탭을 닫거나
 * 프로세스가 죽으면 그대로 남는다. 누를 때마다 쌓이므로 금방 디스크를 다 먹는다.
 * (`copyUploadsForBackup`이 이 찌꺼기를 새 아카이브에 담지는 않는다 — 크기만 문제다)
 */
const WORK_PREFIXES = ["backup_", "restore_"];

/** 빌드 중인 작업 디렉터리를 실수로 지우지 않도록 넉넉히 잡는다 */
export const STALE_WORKSPACE_AGE_MS = 2 * 60 * 60 * 1000;

export type SweptWorkspace = { name: string; bytes: number };

function isWorkspaceName(name: string): boolean {
  return WORK_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/**
 * 이름에 박힌 생성 시각(`backup_<Date.now()>`)을 먼저 본다. mtime은 빌드가 길면
 * 계속 갱신되어 "오래된 것"을 못 고른다.
 */
export function workspaceCreatedAt(name: string): number | null {
  const match = /^(?:backup|restore)_(\d{10,})(?:\.tar\.gz)?$/.exec(name);
  if (!match) return null;
  const ts = Number(match[1]);
  return Number.isFinite(ts) ? ts : null;
}

async function sizeOf(target: string): Promise<number> {
  try {
    const info = await stat(target);
    if (info.isFile()) return info.size;
    if (!info.isDirectory()) return 0;
  } catch {
    return 0;
  }
  let total = 0;
  const stack = [target];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) {
        try {
          total += (await stat(full)).size;
        } catch {
          /* 순회 중 사라진 파일 */
        }
      }
    }
  }
  return total;
}

/** 오래된 작업 디렉터리·아카이브를 지우고 무엇을 얼마나 지웠는지 돌려준다. */
export async function sweepStaleBackupWorkspaces(
  uploadDir: string,
  maxAgeMs: number = STALE_WORKSPACE_AGE_MS,
  now: number = Date.now(),
): Promise<SweptWorkspace[]> {
  let entries;
  try {
    entries = await readdir(uploadDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const swept: SweptWorkspace[] = [];
  for (const entry of entries) {
    if (!isWorkspaceName(entry.name)) continue;
    if (!entry.isDirectory() && !entry.isFile()) continue;
    if (entry.isFile() && !entry.name.endsWith(".tar.gz")) continue;

    const full = path.join(uploadDir, entry.name);
    const createdAt = workspaceCreatedAt(entry.name);
    let age: number;
    if (createdAt !== null) {
      age = now - createdAt;
    } else {
      try {
        age = now - (await stat(full)).mtimeMs;
      } catch {
        continue;
      }
    }
    if (age < maxAgeMs) continue;

    const bytes = await sizeOf(full);
    try {
      await rm(full, { recursive: true, force: true });
      swept.push({ name: entry.name, bytes });
    } catch {
      /* 지우지 못하면 다음 주기에 다시 만난다 */
    }
  }
  return swept;
}
