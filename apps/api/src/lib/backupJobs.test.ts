import { afterEach, describe, expect, it } from "vitest";
import {
  BACKUP_JOB_TTL_MS,
  activeBackupJob,
  backupJobPercent,
  clearBackupJobs,
  createBackupJob,
  deleteBackupJob,
  getBackupJob,
  requestBackupJobCancel,
  sweepExpiredBackupJobs,
  updateBackupJob,
} from "./backupJobs.js";

afterEach(() => clearBackupJobs());

describe("backupJobs", () => {
  // 빌드 하나가 uploads를 통째로 복사한다 — 둘이 겹치면 디스크가 세 배다
  it("reports a running job so a second build is refused", () => {
    const job = createBackupJob("admin-1", 1000);
    expect(activeBackupJob()?.id).toBe(job.id);

    updateBackupJob(job.id, { phase: "ready", archiveBytes: 400 });
    expect(activeBackupJob()).toBeNull();
  });

  /**
   * 담는 단계가 하드링크가 되면서 순식간에 끝난다 — 폭은 압축이 가져간다.
   * 그러지 않으면 막대가 10%에서 몇 분씩 멈춰 있다.
   */
  it("gives most of the bar to compression, where the time actually goes", () => {
    const job = createBackupJob("admin-1", 1000);
    expect(backupJobPercent(job)).toBe(2);

    updateBackupJob(job.id, { phase: "files", copiedBytes: 500 });
    expect(backupJobPercent(getBackupJob(job.id)!)).toBe(6);

    updateBackupJob(job.id, { phase: "archiving", archivedBytes: 500 });
    expect(backupJobPercent(getBackupJob(job.id)!)).toBe(55);

    updateBackupJob(job.id, { phase: "ready" });
    expect(backupJobPercent(getBackupJob(job.id)!)).toBe(100);
  });

  // 압축률을 모르므로 아카이브가 원본보다 커질 수 있다. 막대가 뒤로 가면 안 된다.
  it("never passes 99 before the archive is actually done", () => {
    const job = createBackupJob("admin-1", 1000);
    updateBackupJob(job.id, { phase: "archiving", archivedBytes: 5000 });
    expect(backupJobPercent(getBackupJob(job.id)!)).toBe(99);
  });

  // 첨부가 하나도 없는 인스턴스에서 0으로 나누지 않는다
  it("does not divide by zero when there is nothing to copy", () => {
    const job = createBackupJob("admin-1", 0);
    updateBackupJob(job.id, { phase: "files" });
    expect(backupJobPercent(getBackupJob(job.id)!)).toBe(10);
    updateBackupJob(job.id, { phase: "archiving" });
    expect(backupJobPercent(getBackupJob(job.id)!)).toBe(55);
  });

  /**
   * 파일은 `sweepStaleBackupWorkspaces()`가 2시간 기준으로 걷는다. 작업을 그보다
   * 오래 들고 있으면 아카이브가 이미 없는데 화면은 "받을 수 있다"고 말하게 된다.
   */
  it("drops jobs once the archive sweeper would have taken the file", () => {
    const job = createBackupJob("admin-1", 10);
    updateBackupJob(job.id, { phase: "ready" });

    expect(sweepExpiredBackupJobs(job.createdAt + BACKUP_JOB_TTL_MS)).toEqual([]);
    expect(sweepExpiredBackupJobs(job.createdAt + BACKUP_JOB_TTL_MS + 1)).toEqual([job.id]);
    expect(getBackupJob(job.id)).toBeNull();
  });

  /**
   * 취소는 표시만 한다. 목록에서 바로 빼면 `activeBackupJob()`이 비어 보여 다음
   * 요청이 두 번째 빌드를 시작하고, 그 순간 uploads 사본이 둘이 된다.
   */
  it("keeps a cancelled job listed until the build actually stops", () => {
    const job = createBackupJob("admin-1", 1000);
    expect(requestBackupJobCancel(job.id)).toBe(true);
    expect(getBackupJob(job.id)?.cancelRequested).toBe(true);
    expect(activeBackupJob()?.id).toBe(job.id);
  });

  it("does not cancel a build that already finished", () => {
    const job = createBackupJob("admin-1", 1000);
    updateBackupJob(job.id, { phase: "ready" });
    expect(requestBackupJobCancel(job.id)).toBe(false);
  });

  it("forgets a job that was cancelled from the screen", () => {
    const job = createBackupJob("admin-1", 10);
    deleteBackupJob(job.id);
    expect(getBackupJob(job.id)).toBeNull();
    expect(activeBackupJob()).toBeNull();
  });
});
