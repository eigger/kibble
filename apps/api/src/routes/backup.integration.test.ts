import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, writeFile, readFile, rm } from "fs/promises";
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
  const settingKey = `fixture-setting-${suffix}`;

  beforeAll(async () => {
    assertSafeToWipeDatabase();
    uploadDir = await mkdtemp(path.join(tmpdir(), "kibble-uploads-"));
    process.env.UPLOAD_DIR = uploadDir;

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

    await prisma.setting.create({
      data: { key: settingKey, value: "backup-value" },
    });
  });

  afterAll(async () => {
    await prisma.setting.deleteMany({ where: { key: settingKey } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [adminId, memberId] } } }).catch(() => {});
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
