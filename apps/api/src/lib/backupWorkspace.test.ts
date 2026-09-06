import { mkdtemp, mkdir, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  STALE_WORKSPACE_AGE_MS,
  sweepStaleBackupWorkspaces,
  workspaceCreatedAt,
} from "./backupWorkspace.js";

const dirs: string[] = [];

async function uploadDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "kibble-workspace-"));
  dirs.push(dir);
  // 진짜 첨부 — 이게 지워지면 안 된다
  await mkdir(path.join(dir, "events"), { recursive: true });
  await writeFile(path.join(dir, "events", "a.jpg"), "photo");
  await mkdir(path.join(dir, "tmp"), { recursive: true });
  await writeFile(path.join(dir, "tmp", "chunk"), "partial");
  return dir;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("workspaceCreatedAt", () => {
  it("reads the timestamp out of the name rather than trusting mtime", () => {
    expect(workspaceCreatedAt("backup_1757000000000")).toBe(1757000000000);
    expect(workspaceCreatedAt("restore_1757000000000.tar.gz")).toBe(1757000000000);
    expect(workspaceCreatedAt("events")).toBeNull();
    expect(workspaceCreatedAt("backup_notanumber")).toBeNull();
  });
});

describe("sweepStaleBackupWorkspaces", () => {
  it("removes abandoned work dirs and archives, and reports what they cost", async () => {
    const dir = await uploadDir();
    const old = Date.now() - STALE_WORKSPACE_AGE_MS - 1_000;
    await mkdir(path.join(dir, `backup_${old}`, "files", "events"), { recursive: true });
    await writeFile(path.join(dir, `backup_${old}`, "files", "events", "a.jpg"), "photocopy");
    await writeFile(path.join(dir, `backup_${old}.tar.gz`), "archivebytes");
    await mkdir(path.join(dir, `restore_${old}`), { recursive: true });

    const swept = await sweepStaleBackupWorkspaces(dir);
    expect(swept.map((s) => s.name).sort()).toEqual(
      [`backup_${old}`, `backup_${old}.tar.gz`, `restore_${old}`].sort(),
    );
    expect(swept.reduce((n, s) => n + s.bytes, 0)).toBe("photocopy".length + "archivebytes".length);

    // 첨부와 청크 임시 파일은 그대로다
    const left = (await readdir(dir)).sort();
    expect(left).toEqual(["events", "tmp"]);
  });

  it("leaves a backup that is still being built alone", async () => {
    const dir = await uploadDir();
    const fresh = Date.now() - 60_000;
    await mkdir(path.join(dir, `backup_${fresh}`, "files"), { recursive: true });
    await writeFile(path.join(dir, `backup_${fresh}.tar.gz`), "partial");

    await expect(sweepStaleBackupWorkspaces(dir)).resolves.toEqual([]);
    expect((await readdir(dir)).sort()).toEqual(
      ["events", "tmp", `backup_${fresh}`, `backup_${fresh}.tar.gz`].sort(),
    );
  });

  it("never touches attachment directories even when they are old", async () => {
    const dir = await uploadDir();
    await mkdir(path.join(dir, "pets"), { recursive: true });
    await writeFile(path.join(dir, "pets", "p.jpg"), "pet");

    await expect(sweepStaleBackupWorkspaces(dir, 0)).resolves.toEqual([]);
    expect((await readdir(dir)).sort()).toEqual(["events", "pets", "tmp"]);
  });

  it("returns empty for a missing upload directory", async () => {
    await expect(
      sweepStaleBackupWorkspaces(path.join(tmpdir(), "kibble-nope-xyz")),
    ).resolves.toEqual([]);
  });
});
