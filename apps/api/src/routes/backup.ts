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
import { mkdir, writeFile, readFile, rm } from "fs/promises";
import { copyUploadsForBackup, restoreUploadsFromBackup } from "../lib/backupFiles.js";

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

async function buildBackupArchive(tempDirName: string): Promise<{ tempDir: string; archivePath: string }> {
  const tempDir = path.join(UPLOAD_DIR, tempDirName);
  const filesDir = path.join(tempDir, "files");
  const archivePath = path.join(UPLOAD_DIR, `${tempDirName}.tar.gz`);

  const [users, households, householdMembers, settings] = await Promise.all([
    prisma.user.findMany({ select: USER_EXPORT_SELECT }),
    prisma.household.findMany({ select: HOUSEHOLD_EXPORT_SELECT }),
    prisma.householdMember.findMany({ select: MEMBER_EXPORT_SELECT }),
    prisma.setting.findMany({ where: { key: { notIn: SECRET_SETTING_KEYS } } }),
  ]);

  const dbData = { users, households, householdMembers, settings };

  await mkdir(filesDir, { recursive: true });
  await writeFile(path.join(tempDir, "db.json"), JSON.stringify(dbData, null, 2), "utf8");

  await copyUploadsForBackup(UPLOAD_DIR, filesDir, tempDirName);

  await execAsync(`tar -czf "${archivePath}" -C "${tempDir}" .`);
  return { tempDir, archivePath };
}

export async function backupRoutes(app: FastifyInstance) {
  app.get("/export", async (request, reply) => {
    const ticket = (request.query as { ticket?: string }).ticket;
    if (!ticket) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    let jti: string;
    try {
      const decoded = app.jwt.verify<{ purpose?: string; jti?: string }>(ticket);
      if (decoded.purpose !== "backup" || typeof decoded.jti !== "string" || !decoded.jti) {
        return reply.code(401).send({ error: "unauthorized" });
      }
      jti = decoded.jti;
    } catch {
      return reply.code(401).send({ error: "unauthorized" });
    }

    if (usedBackupTicketJtis.has(jti)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    usedBackupTicketJtis.add(jti);
    setTimeout(() => usedBackupTicketJtis.delete(jti), 60_000);

    const tempDirName = `backup_${Date.now()}`;
    let tempDir = "";
    let archivePath = "";

    try {
      ({ tempDir, archivePath } = await buildBackupArchive(tempDirName));
      const stream = createReadStream(archivePath);
      const cleanup = () => {
        rm(tempDir, { recursive: true, force: true }).catch(() => {});
        rm(archivePath, { force: true }).catch(() => {});
      };
      stream.on("close", cleanup);
      stream.on("error", cleanup);
      reply.raw.on("close", cleanup);

      return reply
        .header("Content-Type", "application/gzip")
        .header(
          "Content-Disposition",
          `attachment; filename="kibble_backup_${new Date().toISOString().slice(0, 10)}.tar.gz"`,
        )
        .send(stream);
    } catch (err: any) {
      app.log.error(err, "Backup export failed");
      if (tempDir) rm(tempDir, { recursive: true, force: true }).catch(() => {});
      if (archivePath) rm(archivePath, { force: true }).catch(() => {});
      return reply.code(500).send({ error: `Backup export failed: ${err.message || err}` });
    }
  });

  await app.register(async (admin) => {
    admin.addHook("preHandler", app.authenticate);
    admin.addHook("preHandler", app.requireAdmin);

    admin.post("/export-ticket", async (request) => {
      const jti = randomBytes(16).toString("hex");
      const ticket = app.jwt.sign(
        { sub: request.user.sub, purpose: "backup", jti },
        { expiresIn: BACKUP_TICKET_EXPIRES },
      );
      return { ticket, expiresIn: 60 };
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
