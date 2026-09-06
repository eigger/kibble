import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { measureUploads, runBackupPreflight } from "./backupPreflight.js";

const dirs: string[] = [];

async function makeUploadDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "kibble-preflight-"));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("measureUploads", () => {
  it("counts nested attachment files", async () => {
    const dir = await makeUploadDir();
    await mkdir(path.join(dir, "events"), { recursive: true });
    await mkdir(path.join(dir, "pets"), { recursive: true });
    await writeFile(path.join(dir, "events", "a.jpg"), "12345");
    await writeFile(path.join(dir, "pets", "b.jpg"), "678");

    await expect(measureUploads(dir)).resolves.toEqual({ sourceBytes: 8, fileCount: 2 });
  });

  it("ignores work dirs, chunk temp files and previous archives", async () => {
    const dir = await makeUploadDir();
    await mkdir(path.join(dir, "events"), { recursive: true });
    await writeFile(path.join(dir, "events", "a.jpg"), "12345");
    // 백업 대상이 아닌 것들 — 이게 세어지면 여유 공간 판정이 부풀어 잘못 막는다
    await mkdir(path.join(dir, "tmp"), { recursive: true });
    await writeFile(path.join(dir, "tmp", "chunk"), "xxxxxxxxxx");
    await mkdir(path.join(dir, "backup_123"), { recursive: true });
    await writeFile(path.join(dir, "backup_123", "leftover"), "xxxxxxxxxx");
    await writeFile(path.join(dir, "backup_123.tar.gz"), "xxxxxxxxxx");

    await expect(measureUploads(dir)).resolves.toEqual({ sourceBytes: 5, fileCount: 1 });
  });

  it("returns zero for a directory that is not there", async () => {
    await expect(measureUploads(path.join(tmpdir(), "kibble-missing-xyz"))).resolves.toEqual({
      sourceBytes: 0,
      fileCount: 0,
    });
  });
});

describe("runBackupPreflight", () => {
  it("passes on a healthy upload directory", async () => {
    const dir = await makeUploadDir();
    await mkdir(path.join(dir, "events"), { recursive: true });
    await writeFile(path.join(dir, "events", "a.jpg"), "12345");

    const result = await runBackupPreflight(dir);
    expect(result.ok).toBe(true);
    expect(result.fileCount).toBe(1);
    expect(result.checks.map((c) => c.name).sort()).toEqual(["diskSpace", "tar", "uploadDir"]);
  });

  it("names the upload directory when it is missing instead of failing silently", async () => {
    const missing = path.join(tmpdir(), `kibble-absent-${Date.now()}`);
    const result = await runBackupPreflight(missing);

    expect(result.ok).toBe(false);
    const failed = result.checks.find((c) => !c.ok);
    expect(failed?.name).toBe("uploadDir");
    expect(failed?.detail).toContain(missing);
  });
});
