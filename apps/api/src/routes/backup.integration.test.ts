import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdir, mkdtemp, writeFile, readFile, rm } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { buildApp } from "../app.js";
import { prisma } from "../lib/prisma.js";

const execFileAsync = promisify(execFile);

function assertSafeToWipeDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/test/i.test(url)) {
    throw new Error(
      `Refusing to run backup restore tests: DATABASE_URL does not look like a disposable test database (${url}).`,
    );
  }
}

async function buildArchive(dbData: Record<string, unknown>): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "kibble-backup-test-"));
  try {
    await writeFile(path.join(dir, "db.json"), JSON.stringify(dbData), "utf8");
    const archivePath = path.join(dir, "archive.tar.gz");
    await execFileAsync("tar", ["-czf", archivePath, "-C", dir, "db.json"]);
    return await readFile(archivePath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** 아카이브 안의 db.json을 그대로 읽는다 — 무엇이 담겼는지(그리고 안 담겼는지) 검사용. */
async function readDbJson(archive: Buffer): Promise<Record<string, unknown>> {
  const dir = await mkdtemp(path.join(tmpdir(), "kibble-backup-read-"));
  try {
    const archivePath = path.join(dir, "archive.tar.gz");
    await writeFile(archivePath, archive);
    await execFileAsync("tar", ["-xzf", archivePath, "-C", dir, "./db.json"]);
    return JSON.parse(await readFile(path.join(dir, "db.json"), "utf8"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** 아카이브에 담긴 파일 목록. files/events/ 가 빠졌던 회귀를 여기서 잡는다. */
async function listArchiveEntries(archive: Buffer): Promise<string[]> {
  const dir = await mkdtemp(path.join(tmpdir(), "kibble-backup-list-"));
  try {
    const archivePath = path.join(dir, "archive.tar.gz");
    await writeFile(archivePath, archive);
    const { stdout } = await execFileAsync("tar", ["-tzf", archivePath]);
    return stdout.split("\n").filter(Boolean);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function multipartRestoreRequest(archive: Buffer) {
  const boundary = `----kibbleBackupTest${randomUUID()}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from(`Content-Disposition: form-data; name="file"; filename="backup.tar.gz"\r\n`),
    Buffer.from(`Content-Type: application/gzip\r\n\r\n`),
    archive,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

async function postRestore(app: FastifyInstance, token: string, archive: Buffer) {
  const { body, contentType } = multipartRestoreRequest(archive);
  return app.inject({
    method: "POST",
    url: "/api/backup/restore",
    headers: { authorization: `Bearer ${token}`, "content-type": contentType },
    payload: body,
  });
}

describe("backup export/restore round trip", () => {
  let app: FastifyInstance;
  let uploadDir = "";
  const suffix = randomUUID();
  let adminId: string;
  let memberId: string;
  let adminToken: string;
  let householdId: string;
  const settingKey = `fixture-setting-${suffix}`;
  const vapidPrivateValue = `vapid-private-${suffix}`;
  /** 첨부가 사는 곳은 uploads/events/ — 디렉터리다. 백업이 이걸 담는지 확인한다. */
  const seededAttachmentRel = `events/backup-fixture-${suffix}.jpg`;
  const seededAttachmentBody = "fixture-photo-bytes";
  let seededAttachmentAbs = "";

  beforeAll(async () => {
    assertSafeToWipeDatabase();
    uploadDir = await mkdtemp(path.join(tmpdir(), "kibble-uploads-"));
    process.env.UPLOAD_DIR = uploadDir;

    seededAttachmentAbs = path.join(uploadDir, seededAttachmentRel);
    await mkdir(path.dirname(seededAttachmentAbs), { recursive: true });
    await writeFile(seededAttachmentAbs, seededAttachmentBody, "utf8");

    app = await buildApp({ logger: false });

    const passwordHash = await bcrypt.hash("test-password-123", 10);
    const admin = await prisma.user.create({
      data: {
        name: "Backup Admin",
        email: `backup-admin-${suffix}@example.com`,
        passwordHash,
        role: "ADMIN",
      },
    });
    adminId = admin.id;
    adminToken = app.jwt.sign({ sub: adminId, role: "ADMIN", tv: 0 });

    const member = await prisma.user.create({
      data: {
        name: "Backup Member",
        email: `backup-member-${suffix}@example.com`,
        passwordHash,
        role: "GENERAL",
      },
    });
    memberId = member.id;

    const household = await prisma.household.create({ data: { name: `Backup HH ${suffix}` } });
    householdId = household.id;
    await prisma.householdMember.createMany({
      data: [
        { householdId, userId: adminId, role: "OWNER" },
        { householdId, userId: memberId, role: "MEMBER" },
      ],
    });

    await prisma.setting.create({
      data: { key: settingKey, value: "backup-value" },
    });
    await prisma.setting.create({
      data: { key: "VAPID_PRIVATE_KEY", value: vapidPrivateValue },
    });
  });

  afterAll(async () => {
    await prisma.setting
      .deleteMany({ where: { key: { in: [settingKey, "VAPID_PRIVATE_KEY"] } } })
      .catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [adminId, memberId] } } }).catch(() => {});
    await prisma.household.deleteMany({ where: { id: householdId } }).catch(() => {});
    await app.close();
    await prisma.$disconnect();
    if (uploadDir) await rm(uploadDir, { recursive: true, force: true }).catch(() => {});
  });

  it("round-trips users and settings through export ticket + restore", async () => {
    const ticketRes = await app.inject({
      method: "POST",
      url: "/api/backup/export-ticket",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(ticketRes.statusCode).toBe(200);
    const { ticket } = ticketRes.json() as { ticket: string };
    expect(ticket).toBeTruthy();

    const exportRes = await app.inject({
      method: "GET",
      url: `/api/backup/export?ticket=${encodeURIComponent(ticket)}`,
    });
    expect(exportRes.statusCode).toBe(200);
    expect(exportRes.headers["content-type"]).toBe("application/gzip");
    const archive = exportRes.rawPayload;
    expect(archive.length).toBeGreaterThan(0);

    // 첨부는 uploads/events/ 아래에 있다 — 최상위 파일만 복사하던 시절 통째로 빠졌고,
    // 이 잡이 그걸 놓쳤다. 아카이브 목록과 복원 결과 양쪽으로 못박는다.
    const archiveEntries = await listArchiveEntries(archive);
    expect(archiveEntries.some((entry) => entry.endsWith(seededAttachmentRel))).toBe(true);
    await rm(seededAttachmentAbs, { force: true });

    await prisma.user.create({
      data: {
        name: "Should Be Wiped",
        email: `wiped-${suffix}@example.com`,
        passwordHash: await bcrypt.hash("x", 10),
        role: "GENERAL",
      },
    });

    const restoreRes = await postRestore(app, adminToken, archive);
    expect(restoreRes.statusCode).toBe(200);
    const body = restoreRes.json() as {
      success: boolean;
      passwordResetRequired: boolean;
      recoveryPasswords: { email: string }[];
    };
    expect(body.success).toBe(true);
    expect(body.passwordResetRequired).toBe(true);

    // 내보내기와 복원이 대칭이어야 한다 — 평평하게 복사하면 여기서 걸린다
    expect(existsSync(seededAttachmentAbs)).toBe(true);
    expect(await readFile(seededAttachmentAbs, "utf8")).toBe(seededAttachmentBody);
    expect(body.recoveryPasswords.map((r) => r.email).sort()).toEqual(
      [`backup-admin-${suffix}@example.com`, `backup-member-${suffix}@example.com`].sort(),
    );

    await expect(prisma.user.count()).resolves.toBe(2);
    await expect(prisma.setting.count({ where: { key: settingKey } })).resolves.toBe(1);

    const restoredAdmin = await prisma.user.findUnique({ where: { id: adminId } });
    expect(restoredAdmin?.email).toBe(`backup-admin-${suffix}@example.com`);
    expect(restoredAdmin?.role).toBe("ADMIN");

    const restoredSetting = await prisma.setting.findUnique({ where: { key: settingKey } });
    expect(restoredSetting?.value).toBe("backup-value");

    // 가구·멤버십이 살아남아야 한다 — 계정만 되살리면 전원이 householdId=null로 떨어진다.
    await expect(prisma.household.count({ where: { id: householdId } })).resolves.toBe(1);
    const restoredMembers = await prisma.householdMember.findMany({
      where: { householdId },
      orderBy: { userId: "asc" },
      select: { userId: true, role: true },
    });
    expect(restoredMembers).toEqual(
      [
        { userId: adminId, role: "OWNER" },
        { userId: memberId, role: "MEMBER" },
      ].sort((a, b) => a.userId.localeCompare(b.userId)),
    );

    // VAPID 개인키는 아카이브에 실리지 않고, 복원이 서버의 기존 값을 지우지도 않는다.
    const dbJson = await readDbJson(archive);
    const exportedSettings = dbJson.settings as { key: string }[];
    expect(exportedSettings.map((row) => row.key)).not.toContain("VAPID_PRIVATE_KEY");
    expect(JSON.stringify(dbJson)).not.toContain(vapidPrivateValue);
    const survivingVapid = await prisma.setting.findUnique({ where: { key: "VAPID_PRIVATE_KEY" } });
    expect(survivingVapid?.value).toBe(vapidPrivateValue);
  });

  it("rejects a restore request with no file part", async () => {
    const boundary = `----kibbleBackupTestNoFile${randomUUID()}`;
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from(`Content-Disposition: form-data; name="note"\r\n\r\n`),
      Buffer.from("no file in this request"),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/backup/restore",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an archive without db.json", async () => {
    const archive = await buildArchive({ notUsers: [] });
    const res = await postRestore(app, adminToken, archive);
    expect(res.statusCode).toBe(400);
  });
});
