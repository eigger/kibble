import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { copyUploadsForBackup, restoreUploadsFromBackup } from "./backupFiles.js";

/**
 * 백업이 최상위 **파일**만 복사하던 시절 사진·영상이 통째로 빠졌다 — 첨부는
 * uploads/events/, 펫 사진은 uploads/pets/ 라 둘 다 디렉터리다. 백업은 잘못돼도
 * 복원할 때까지 아무도 모르는 종류의 버그라 테스트로 못박는다.
 */
describe("backupFiles", () => {
  let uploadDir = "";
  let filesDir = "";

  beforeEach(async () => {
    uploadDir = await mkdtemp(path.join(tmpdir(), "kibble-backup-src-"));
    filesDir = await mkdtemp(path.join(tmpdir(), "kibble-backup-dst-"));
  });

  afterEach(async () => {
    for (const dir of [uploadDir, filesDir]) {
      if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  async function seedUploads() {
    await mkdir(path.join(uploadDir, "events"), { recursive: true });
    await mkdir(path.join(uploadDir, "pets"), { recursive: true });
    await mkdir(path.join(uploadDir, "tmp"), { recursive: true });
    await writeFile(path.join(uploadDir, "events", "evt-1.jpg"), "photo-bytes");
    await writeFile(path.join(uploadDir, "events", "evt-2.mp4"), "video-bytes");
    await writeFile(path.join(uploadDir, "pets", "pet-1.webp"), "pet-bytes");
    await writeFile(path.join(uploadDir, "tmp", "half-sent.part"), "chunk-bytes");
    await writeFile(path.join(uploadDir, "kibble_backup_old.tar.gz"), "old-archive");
    await writeFile(path.join(uploadDir, "legacy-flat.jpg"), "legacy-bytes");
  }

  it("copies attachments and pet photos inside their directories", async () => {
    await seedUploads();

    await copyUploadsForBackup(uploadDir, filesDir, "backup-work");

    expect(await readFile(path.join(filesDir, "events", "evt-1.jpg"), "utf8")).toBe("photo-bytes");
    expect(await readFile(path.join(filesDir, "events", "evt-2.mp4"), "utf8")).toBe("video-bytes");
    expect(await readFile(path.join(filesDir, "pets", "pet-1.webp"), "utf8")).toBe("pet-bytes");
    // 루트에 평평하게 있던 예전 파일도 그대로 담는다
    expect(await readFile(path.join(filesDir, "legacy-flat.jpg"), "utf8")).toBe("legacy-bytes");
  });

  it("skips chunk temp parts, old archives and the in-progress work dir", async () => {
    await seedUploads();
    await mkdir(path.join(uploadDir, "backup-work"), { recursive: true });
    await writeFile(path.join(uploadDir, "backup-work", "db.json"), "{}");

    await copyUploadsForBackup(uploadDir, filesDir, "backup-work");

    const copied = await readdir(filesDir);
    expect(copied).not.toContain("tmp");
    expect(copied).not.toContain("kibble_backup_old.tar.gz");
    expect(copied).not.toContain("backup-work");
  });

  it("does nothing when the upload dir does not exist yet", async () => {
    await rm(uploadDir, { recursive: true, force: true });
    await expect(copyUploadsForBackup(uploadDir, filesDir, "backup-work")).resolves.toBeUndefined();
    expect(await readdir(filesDir)).toEqual([]);
  });

  it("restores nested files back into the upload dir", async () => {
    await mkdir(path.join(filesDir, "events"), { recursive: true });
    await writeFile(path.join(filesDir, "events", "evt-1.jpg"), "restored-photo");
    await writeFile(path.join(filesDir, "legacy-flat.jpg"), "restored-legacy");

    await restoreUploadsFromBackup(filesDir, uploadDir);

    expect(await readFile(path.join(uploadDir, "events", "evt-1.jpg"), "utf8")).toBe(
      "restored-photo",
    );
    expect(await readFile(path.join(uploadDir, "legacy-flat.jpg"), "utf8")).toBe("restored-legacy");
  });

  it("survives a full round trip", async () => {
    await seedUploads();
    await copyUploadsForBackup(uploadDir, filesDir, "backup-work");
    await rm(path.join(uploadDir, "events"), { recursive: true, force: true });

    await restoreUploadsFromBackup(filesDir, uploadDir);

    expect(await readFile(path.join(uploadDir, "events", "evt-2.mp4"), "utf8")).toBe("video-bytes");
  });
});
