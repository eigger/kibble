import { randomUUID } from "node:crypto";

/**
 * 내보내기 진행 상황을 담아 두는 곳.
 *
 * 예전에는 상태랄 게 없었다 — `GET /export` 하나가 아카이브를 만들고 그 응답으로
 * 흘려보냈다. 새 탭은 첫 바이트가 나올 때까지(첨부가 많으면 분 단위) 빈 흰 화면이라,
 * 사용자가 "아무것도 안 된다"고 읽고 탭을 닫았다 (R124·R125에서 토스트·프리플라이트로
 * 덧댔지만 침묵 자체는 그대로였다). 빌드를 요청에서 떼어내고 진행률을 물어볼 수 있게
 * 만들면, 화면이 얼마나 갔는지 말할 수 있고 다 됐을 때 링크를 건넬 수 있다.
 *
 * 메모리에만 둔다. API는 단일 프로세스이고, 재시작하면 작업 디렉터리는 어차피
 * `sweepStaleBackupWorkspaces()`가 걷는다 — 살아남아야 할 상태가 아니다.
 */
export type BackupJobPhase = "database" | "files" | "archiving" | "ready" | "failed";

export type BackupJob = {
  id: string;
  /** 만든 관리자. 남의 작업 진행률을 들여다볼 이유가 없다 */
  userId: string;
  phase: BackupJobPhase;
  /** 담아야 할 총량 (프리플라이트 실측). files·archiving 두 단계가 같이 쓴다 */
  totalBytes: number;
  copiedBytes: number;
  /** archiving 단계에서 지금까지 만들어진 아카이브 크기 */
  archivedBytes: number;
  /** 다 만든 아카이브 크기. ready 전에는 null */
  archiveBytes: number | null;
  error: string | null;
  /** `backup_<ts>` — 작업 디렉터리와 아카이브 이름의 뿌리 */
  tempDirName: string;
  /**
   * 화면이 취소를 눌렀다. 빌드를 밖에서 죽일 수는 없으므로(tar가 반쯤 쓴 파일을
   * 남긴다) 플래그만 세우고, 빌드가 다음 확인 지점에서 스스로 접는다.
   */
  cancelRequested: boolean;
  createdAt: number;
};

/**
 * 스윕이 작업 디렉터리를 걷는 나이와 같게 둔다. 더 오래 들고 있으면 파일이 이미
 * 없는데 화면은 "받을 수 있다"고 말하게 된다.
 */
export const BACKUP_JOB_TTL_MS = 2 * 60 * 60 * 1000;

const jobs = new Map<string, BackupJob>();

export function isBackupJobActive(job: BackupJob): boolean {
  return job.phase !== "ready" && job.phase !== "failed";
}

/** 동시에 하나만 돈다 — 빌드 한 번이 uploads 한 벌을 복사하므로 두 개면 디스크가 세 배다 */
export function activeBackupJob(): BackupJob | null {
  for (const job of jobs.values()) {
    if (isBackupJobActive(job)) return job;
  }
  return null;
}

export function createBackupJob(userId: string, totalBytes: number): BackupJob {
  const id = randomUUID();
  const job: BackupJob = {
    id,
    userId,
    phase: "database",
    totalBytes,
    copiedBytes: 0,
    archivedBytes: 0,
    archiveBytes: null,
    error: null,
    tempDirName: `backup_${Date.now()}`,
    cancelRequested: false,
    createdAt: Date.now(),
  };
  jobs.set(id, job);
  return job;
}

export function getBackupJob(id: string): BackupJob | null {
  return jobs.get(id) ?? null;
}

export function updateBackupJob(id: string, patch: Partial<BackupJob>): BackupJob | null {
  const job = jobs.get(id);
  if (!job) return null;
  Object.assign(job, patch);
  return job;
}

export function deleteBackupJob(id: string): void {
  jobs.delete(id);
}

/**
 * 취소를 표시한다. **목록에서 빼지 않는다** — 빼면 `activeBackupJob()`이 비어
 * 보이고 다음 요청이 두 번째 빌드를 시작한다. 빌드 하나가 uploads 한 벌을
 * 복사하므로 그 순간 디스크가 세 배가 된다. 빌드가 스스로 접고 나갈 때 지운다.
 */
export function requestBackupJobCancel(id: string): boolean {
  const job = jobs.get(id);
  if (!job || !isBackupJobActive(job)) return false;
  job.cancelRequested = true;
  return true;
}

export class BackupJobCancelledError extends Error {
  constructor() {
    super("BACKUP_JOB_CANCELLED");
    this.name = "BackupJobCancelledError";
  }
}

/** 테스트에서 전역 상태를 비운다 */
export function clearBackupJobs(): void {
  jobs.clear();
}

/**
 * 나이를 다 먹은 작업을 목록에서 뺀다. 파일은 지우지 않는다 — 그건
 * `sweepStaleBackupWorkspaces()`의 일이고, 두 곳이 같은 파일을 지우려 들면
 * 빌드 중인 것을 잘못 걷을 위험만 는다.
 */
export function sweepExpiredBackupJobs(now = Date.now()): string[] {
  const swept: string[] = [];
  for (const [id, job] of jobs) {
    if (now - job.createdAt <= BACKUP_JOB_TTL_MS) continue;
    jobs.delete(id);
    swept.push(id);
  }
  return swept;
}

/**
 * 화면이 그릴 진행률.
 *
 * 단계 폭이 예전과 반대다. `files`가 하드링크가 되면서 사실상 순식간에 끝나고,
 * 시간은 전부 압축(`archiving`)으로 옮겨 갔다 — 폭도 거기에 줘야 막대가 움직인다.
 */
export function backupJobPercent(job: BackupJob): number {
  if (job.phase === "ready") return 100;
  if (job.phase === "failed") return 0;
  if (job.phase === "database") return 2;
  if (job.totalBytes <= 0) return job.phase === "archiving" ? 55 : 10;

  if (job.phase === "archiving") {
    // 사진·영상은 이미 압축돼 있어 아카이브가 원본과 비슷한 크기로 자란다. 어긋나도
    // 막대가 뒤로 가지 않게 99에서 멈춘다 — 100은 실제로 끝났을 때만 쓴다.
    const archived = Math.min(job.archivedBytes / job.totalBytes, 1);
    return Math.min(99, Math.round(10 + archived * 89));
  }

  const copied = Math.min(job.copiedBytes / job.totalBytes, 1);
  return Math.round(2 + copied * 8);
}
