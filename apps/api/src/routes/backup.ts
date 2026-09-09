import { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { t } from "../lib/i18n.js";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { existsSync } from "fs";
import { mkdir, writeFile, readFile, rm, stat } from "fs/promises";
import { copyUploadsForBackup, restoreUploadsFromBackup } from "../lib/backupFiles.js";
import { classifyBackupTicket } from "../lib/backupTicket.js";
import { runBackupPreflight } from "../lib/backupPreflight.js";
import {
  activeBackupJob,
  backupJobPercent,
  BackupJobCancelledError,
  createBackupJob,
  deleteBackupJob,
  getBackupJob,
  requestBackupJobCancel,
  updateBackupJob,
  type BackupJob,
} from "../lib/backupJobs.js";

const execAsync = promisify(exec);
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

const BACKUP_TICKET_EXPIRES = "60s";

/**
 * 복원 아카이브 상한 (기본 2047MB).
 *
 * 백업이 실제로 사진·영상을 담게 되면서 이 숫자가 처음으로 의미를 갖게 됐다 — 그전에는
 * 아카이브가 사실상 db.json뿐이라 500MB든 5MB든 상관이 없었다. 업로드 단건 상한이
 * 150MB라도 **누적 첨부**는 금방 그걸 넘으므로, 내보내기는 되는데 복원이 막히는 상황이
 * 나오면 안 된다. 아카이브는 스트림으로 디스크에 받으므로 메모리가 아니라 디스크가
 * 유일한 제약이다.
 *
 * 2048이 아니라 2047인 이유: 2048MB는 정확히 2^31바이트다. 경로 어딘가에 크기를 signed
 * 32-bit로 다루는 층이 있으면 하필 그 경계에서 뒤집힌다 — 1MB 덜 잡아 피한다.
 */
const RESTORE_LIMIT_BYTES = Number(process.env.BACKUP_RESTORE_LIMIT_MB ?? 2047) * 1024 * 1024;

const USER_EXPORT_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  tokenVersion: true,
  createdAt: true,
} as const;

// 가구와 멤버십을 함께 담는다. 계정만 복원하면 HouseholdMember가 되살아나지 않아
// 복원 직후 전원이 householdId=null로 떨어지고 기존 Household·Pet·Event가 고아가 된다.
const HOUSEHOLD_EXPORT_SELECT = { id: true, name: true, createdAt: true } as const;
const MEMBER_EXPORT_SELECT = {
  id: true,
  householdId: true,
  userId: true,
  role: true,
} as const;

// WORKPLAN §8 — 외부 API 키·푸시 서명키는 Setting(DB)에만 두고 백업 대상에서 제외한다.
// 아카이브는 관리자가 자기 PC로 내려받아 보관하므로 평문 비밀이 들어가면 안 된다.
// 복원 시에도 지우지 않는다 — 서버에 이미 있는 키가 정답이다.
const SECRET_SETTING_KEYS = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"];

const usedBackupTicketJtis = new Set<string>();

function archivePathFor(tempDirName: string): string {
  return path.join(UPLOAD_DIR, `${tempDirName}.tar.gz`);
}

/**
 * 아카이브를 만든다. 요청 밖에서 돈다 — 응답을 붙잡고 만들던 시절에는 새 탭이
 * 빌드 내내(첨부가 많으면 분 단위) 빈 흰 화면이었고, 그 침묵이 "아무것도 안 됨"으로
 * 읽혀 사용자가 탭을 닫았다. 진행 상황은 작업(job)에 적고 화면이 물어보게 한다.
 */
async function runBackupJob(app: FastifyInstance, job: BackupJob): Promise<void> {
  const tempDir = path.join(UPLOAD_DIR, job.tempDirName);
  const filesDir = path.join(tempDir, "files");
  const archivePath = archivePathFor(job.tempDirName);
  const startedAt = Date.now();

  const abortIfCancelled = () => {
    if (getBackupJob(job.id)?.cancelRequested) throw new BackupJobCancelledError();
  };

  try {
    updateBackupJob(job.id, { phase: "database" });
    const [users, households, householdMembers, settings] = await Promise.all([
      prisma.user.findMany({ select: USER_EXPORT_SELECT }),
      prisma.household.findMany({ select: HOUSEHOLD_EXPORT_SELECT }),
      prisma.householdMember.findMany({ select: MEMBER_EXPORT_SELECT }),
      prisma.setting.findMany({ where: { key: { notIn: SECRET_SETTING_KEYS } } }),
    ]);
    const dbData = { users, households, householdMembers, settings };

    await mkdir(filesDir, { recursive: true });
    await writeFile(path.join(tempDir, "db.json"), JSON.stringify(dbData, null, 2), "utf8");

    abortIfCancelled();
    updateBackupJob(job.id, { phase: "files" });
    await copyUploadsForBackup(UPLOAD_DIR, filesDir, job.tempDirName, (bytes) => {
      const current = getBackupJob(job.id);
      if (current) current.copiedBytes += bytes;
      // 복사 도중에 접는 유일한 방법이다 — 파일 하나 사이가 확인 지점이 된다
      abortIfCancelled();
    });

    abortIfCancelled();
    updateBackupJob(job.id, { phase: "archiving" });
    await execAsync(`tar -czf "${archivePath}" -C "${tempDir}" .`);

    // 사본은 여기서 바로 버린다. 예전에는 다운로드 스트림이 닫힐 때까지 들고 있어
    // 원본 2배가 그동안 계속 잡혀 있었다 — 아카이브가 나온 뒤로는 쓸모가 없다.
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});

    const archiveStat = await stat(archivePath);
    updateBackupJob(job.id, { phase: "ready", archiveBytes: archiveStat.size });
    app.log.info({ ms: Date.now() - startedAt, bytes: archiveStat.size }, "Backup archive built");
  } catch (err) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    await rm(archivePath, { force: true }).catch(() => {});

    if (err instanceof BackupJobCancelledError) {
      // 취소는 실패가 아니다. 여기서 목록에서 뺀다 — 그전에 빼면 빌드가 도는 채로
      // 잠금이 풀려 두 번째 빌드가 시작된다.
      app.log.info({ jobId: job.id }, "Backup export cancelled");
      deleteBackupJob(job.id);
      return;
    }

    app.log.error(err, "Backup export failed");
    updateBackupJob(job.id, {
      phase: "failed",
      error: err instanceof Error ? err.message.slice(0, 300) : String(err),
    });
  }
}

function backupJobView(job: BackupJob) {
  return {
    jobId: job.id,
    phase: job.phase,
    percent: backupJobPercent(job),
    copiedBytes: job.copiedBytes,
    totalBytes: job.totalBytes,
    archiveBytes: job.archiveBytes,
    error: job.error,
  };
}

export async function backupRoutes(app: FastifyInstance) {
  app.get("/export", async (request, reply) => {
    // 세 가지 실패를 구분해 돌려준다. 예전에는 전부 같은 문구라, 사용자가 "백업 누르면
    // unauthorized"라고 알려줘도 티켓이 안 온 건지·만료된 건지·이미 쓴 건지 알 수 없었다.
    const verdict = classifyBackupTicket({
      ticket: (request.query as { ticket?: string }).ticket,
      verify: (token) => app.jwt.verify<{ purpose?: string; jti?: string; jobId?: string }>(token),
      isUsed: (jti) => usedBackupTicketJtis.has(jti),
    });
    if (!verdict.ok) {
      app.log.warn({ reason: verdict.reason }, "Backup export ticket rejected");
      return reply.code(401).send({ error: "unauthorized", reason: verdict.reason });
    }

    // 이제 이 라우트는 만들지 않는다 — 미리 만들어 둔 것을 흘려보낼 뿐이다.
    const job = verdict.jobId ? getBackupJob(verdict.jobId) : null;
    if (!job || job.phase !== "ready") {
      app.log.warn({ jobId: verdict.jobId, phase: job?.phase }, "Backup export archive not ready");
      return reply.code(409).send({ error: "backup_not_ready", phase: job?.phase ?? "gone" });
    }

    const archivePath = archivePathFor(job.tempDirName);
    let archiveStat;
    try {
      archiveStat = await stat(archivePath);
    } catch {
      // 스윕이 이미 걷어 갔다 — 작업만 남아 "받을 수 있다"고 거짓말하지 않게 지운다
      deleteBackupJob(job.id);
      return reply.code(409).send({ error: "backup_not_ready", phase: "gone" });
    }

    usedBackupTicketJtis.add(verdict.jti);
    setTimeout(() => usedBackupTicketJtis.delete(verdict.jti), 60_000);

    const stream = createReadStream(archivePath);
    const cleanup = () => {
      rm(archivePath, { force: true }).catch(() => {});
      deleteBackupJob(job.id);
    };
    stream.on("close", cleanup);
    stream.on("error", cleanup);

    return reply
      .header("Content-Type", "application/gzip")
      // 길이를 알려야 브라우저가 진행률을 그리고, 길이 없는 chunked 응답을 통째로
      // 버퍼링하는 프록시에 걸리지 않는다.
      .header("Content-Length", String(archiveStat.size))
      .header(
        "Content-Disposition",
        `attachment; filename="kibble_backup_${new Date().toISOString().slice(0, 10)}.tar.gz"`,
      )
      .send(stream);
  });

  await app.register(async (admin) => {
    admin.addHook("preHandler", app.authenticate);
    admin.addHook("preHandler", app.requireAdmin);

    /**
     * 아카이브 만들기를 시작한다. 응답은 즉시 돌아오고 빌드는 뒤에서 돈다 —
     * 화면은 `GET /export/jobs/:id`로 진행률을 물어본다.
     */
    admin.post("/export/jobs", async (request, reply) => {
      const running = activeBackupJob();
      if (running) {
        // 빌드 하나가 uploads 한 벌을 복사한다. 둘이 겹치면 디스크가 세 배다.
        return reply.code(409).send({ ...backupJobView(running), error: "backup_already_running" });
      }

      const preflight = await runBackupPreflight(UPLOAD_DIR);
      if (!preflight.ok) {
        const failed = preflight.checks.find((check) => !check.ok);
        return reply
          .code(400)
          .send({ error: "backup_preflight_failed", detail: failed?.detail ?? failed?.name });
      }

      const job = createBackupJob(request.user.sub, preflight.sourceBytes);
      // 일부러 await하지 않는다 — 요청은 지금 돌려주고 빌드는 뒤에서 돈다.
      void runBackupJob(app, job);
      return backupJobView(job);
    });

    admin.get("/export/jobs/:jobId", async (request, reply) => {
      const { jobId } = request.params as { jobId: string };
      const job = getBackupJob(jobId);
      if (!job || job.userId !== request.user.sub) {
        return reply.code(404).send({ error: "backup_job_not_found" });
      }
      return backupJobView(job);
    });

    /** 취소하거나, 다 만든 아카이브를 버린다 — 아무도 안 받을 것을 디스크에 두지 않는다 */
    admin.delete("/export/jobs/:jobId", async (request, reply) => {
      const { jobId } = request.params as { jobId: string };
      const job = getBackupJob(jobId);
      if (!job || job.userId !== request.user.sub) {
        return reply.code(404).send({ error: "backup_job_not_found" });
      }

      // 빌드 중이면 파일을 여기서 지우지 않는다 — 쓰고 있는 것을 지우면 tar가 깨진다.
      // 플래그만 세우고, 빌드가 다음 확인 지점에서 스스로 접으며 치운다.
      if (requestBackupJobCancel(job.id)) return { ok: true, cancelling: true };

      await rm(archivePathFor(job.tempDirName), { force: true }).catch(() => {});
      deleteBackupJob(job.id);
      return { ok: true, cancelling: false };
    });

    admin.post("/export-ticket", async (request, reply) => {
      const { jobId } = (request.body ?? {}) as { jobId?: string };
      const job = jobId ? getBackupJob(jobId) : null;
      if (!job || job.userId !== request.user.sub) {
        return reply.code(404).send({ error: "backup_job_not_found" });
      }
      if (job.phase !== "ready") {
        return reply.code(409).send({ error: "backup_not_ready", phase: job.phase });
      }

      const jti = randomBytes(16).toString("hex");
      const ticket = app.jwt.sign(
        { sub: request.user.sub, purpose: "backup", jti, jobId: job.id },
        { expiresIn: BACKUP_TICKET_EXPIRES },
      );
      return { ticket, expiresIn: 60 };
    });

    /**
     * 내보내기가 실패할 조건을 미리 본다. 다운로드는 새 탭이 받아 가므로 앱이 실패를
     * 볼 방법이 없다 — 눌러 보기 전에 앱 안에서 이유를 보여주려는 것이다. K-7 — 읽기 전용.
     */
    admin.get("/export/preflight", async () => {
      return runBackupPreflight(UPLOAD_DIR);
    });

    admin.post("/restore", async (request, reply) => {
      const file = await request.file({ limits: { fileSize: RESTORE_LIMIT_BYTES } });
      if (!file) return reply.code(400).send({ error: t("noBackupFileUploaded", request.locale) });

      const restoreTempDirName = `restore_${Date.now()}`;
      const restoreTempDir = path.join(UPLOAD_DIR, restoreTempDirName);
      const archivePath = path.join(UPLOAD_DIR, `${restoreTempDirName}.tar.gz`);

      try {
        await mkdir(restoreTempDir, { recursive: true });
        // toBuffer()는 아카이브 전체를 메모리에 올린다 — 첨부가 들어간 뒤로는 그대로
        // 프로세스를 죽이는 길이다. 디스크로 흘려보낸다.
        await pipeline(file.file, createWriteStream(archivePath));
        if (file.file.truncated) {
          const limit = `${Math.floor(RESTORE_LIMIT_BYTES / 1024 / 1024)}MB`;
          return reply.code(413).send({ error: t("fileTooLarge", request.locale, { limit }) });
        }
        await execAsync(`tar -xzf "${archivePath}" -C "${restoreTempDir}"`);

        const dbJsonPath = path.join(restoreTempDir, "db.json");
        if (!existsSync(dbJsonPath)) {
          return reply.code(400).send({ error: t("invalidBackupFile", request.locale) });
        }
        const dbData = JSON.parse(await readFile(dbJsonPath, "utf8"));
        if (!dbData || typeof dbData !== "object" || !Array.isArray(dbData.users)) {
          return reply.code(400).send({ error: t("invalidBackupFile", request.locale) });
        }

        type BackupUser = {
          id: string;
          name: string;
          email: string;
          role: "ADMIN" | "GENERAL";
          passwordHash?: string;
          tokenVersion?: number;
          createdAt?: string;
        };
        const recoveryPasswords: { email: string; role: "ADMIN" | "GENERAL"; temporaryPassword: string }[] = [];
        const usersToCreate: Array<{
          id: string;
          name: string;
          email: string;
          role: "ADMIN" | "GENERAL";
          passwordHash: string;
          tokenVersion: number;
          createdAt: Date;
        }> = [];
        let anyMissingHash = false;

        for (const raw of dbData.users as BackupUser[]) {
          if (!raw?.id || !raw?.email || !raw?.name || !raw?.role) {
            return reply.code(400).send({ error: t("invalidBackupFile", request.locale) });
          }
          let passwordHash = raw.passwordHash;
          if (!passwordHash) {
            anyMissingHash = true;
            const temporaryPassword = randomBytes(12).toString("base64url");
            passwordHash = await bcrypt.hash(temporaryPassword, 10);
            recoveryPasswords.push({ email: raw.email, role: raw.role, temporaryPassword });
          }
          usersToCreate.push({
            id: raw.id,
            name: raw.name,
            email: raw.email,
            role: raw.role,
            passwordHash,
            tokenVersion: typeof raw.tokenVersion === "number" ? raw.tokenVersion : 0,
            createdAt: raw.createdAt ? new Date(raw.createdAt) : new Date(),
          });
        }

        if (anyMissingHash && !usersToCreate.some((u) => u.role === "ADMIN") && usersToCreate.length > 0) {
          const target = usersToCreate[0];
          target.role = "ADMIN";
          const entry = recoveryPasswords.find((r) => r.email === target.email);
          if (entry) entry.role = "ADMIN";
        }

        // 계정만 되살리면 User 삭제가 HouseholdMember를 캐스케이드로 지워버려 가구가
        // 통째로 끊긴다. 가구·멤버십을 같은 트랜잭션에서 되돌린다. Household 자체는
        // 절대 지우지 않는다 — Pet·Event가 캐스케이드로 날아간다.
        type BackupHousehold = { id: string; name: string; createdAt?: string };
        type BackupMember = {
          id: string;
          householdId: string;
          userId: string;
          role: "OWNER" | "MEMBER" | "VIEWER";
        };
        const householdsToRestore = (
          Array.isArray(dbData.households) ? (dbData.households as BackupHousehold[]) : []
        )
          .filter((row) => row?.id && row?.name)
          .map((row) => ({
            id: row.id,
            name: row.name,
            createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
          }));
        const restoredUserIds = new Set(usersToCreate.map((u) => u.id));
        const restoredHouseholdIds = new Set(householdsToRestore.map((h) => h.id));
        const membersToRestore = (
          Array.isArray(dbData.householdMembers) ? (dbData.householdMembers as BackupMember[]) : []
        ).filter(
          (row) =>
            row?.id && restoredUserIds.has(row.userId) && restoredHouseholdIds.has(row.householdId),
        );

        await prisma.$transaction(async (tx) => {
          // 비밀 설정(VAPID 키)은 아카이브에 없으므로 지우면 복구할 길이 없다 — 서버 값을 남긴다.
          await tx.setting.deleteMany({ where: { key: { notIn: SECRET_SETTING_KEYS } } });
          await tx.user.deleteMany();

          if (usersToCreate.length) await tx.user.createMany({ data: usersToCreate });
          if (householdsToRestore.length) {
            await tx.household.createMany({ data: householdsToRestore, skipDuplicates: true });
          }
          if (membersToRestore.length) {
            await tx.householdMember.createMany({ data: membersToRestore, skipDuplicates: true });
          }
          if (dbData.settings?.length) {
            const settings = (dbData.settings as { key: string; value: string }[]).filter(
              (row) => row?.key && !SECRET_SETTING_KEYS.includes(row.key),
            );
            if (settings.length) await tx.setting.createMany({ data: settings });
          }
        });

        await restoreUploadsFromBackup(path.join(restoreTempDir, "files"), UPLOAD_DIR);

        return {
          success: true,
          passwordResetRequired: recoveryPasswords.length > 0,
          recoveryPasswords,
          adminRecoveryPasswords: recoveryPasswords.filter((r) => r.role === "ADMIN"),
        };
      } catch (err: any) {
        app.log.error(err, "Backup restore failed");
        return reply.code(500).send({ error: `Restore failed: ${err.message || err}` });
      } finally {
        rm(restoreTempDir, { recursive: true, force: true }).catch(() => {});
        rm(archivePath, { force: true }).catch(() => {});
      }
    });
  });
}
