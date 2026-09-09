import { link, mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
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

  // 정상 종료하면 지워지지만 프로세스가 중간에 죽으면 남는다 — 담으면 백업 안에 백업이 중첩된다
  it("skips leftover work dirs from crashed backups and restores", async () => {
    await seedUploads();
    for (const name of ["backup_1757000000000", "restore_1757000000000"]) {
      await mkdir(path.join(uploadDir, name, "files", "events"), { recursive: true });
      await writeFile(path.join(uploadDir, name, "files", "events", "nested.jpg"), "nested");
    }

    await copyUploadsForBackup(uploadDir, filesDir, "backup-work");

    const copied = await readdir(filesDir);
    expect(copied).not.toContain("backup_1757000000000");
    expect(copied).not.toContain("restore_1757000000000");
    // 진짜 첨부는 그대로 담긴다
    expect(copied).toContain("events");
  });

  // 접두어만 보고 자르면 안 된다 — 사용자 첨부 디렉터리가 그 이름일 수도 있다
  it("only skips work-dir names that are directories", async () => {
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, "backup_notes.txt"), "a real file");

    await copyUploadsForBackup(uploadDir, filesDir, "backup-work");

    expect(await readdir(filesDir)).toContain("backup_notes.txt");
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

  // 진행률을 그리려고 파일 단위로 내려간다 — 합계가 실제 바이트와 맞아야 한다
  it("reports every copied byte so the screen can draw progress", async () => {
    await seedUploads();
    const seen: number[] = [];

    await copyUploadsForBackup(uploadDir, filesDir, "backup-work", (bytes) => seen.push(bytes));

    // events 2개 + pets 1개 + 루트 평면 파일 1개 — tmp와 이전 아카이브는 빠진다
    expect(seen).toHaveLength(4);
    const total = seen.reduce((sum, n) => sum + n, 0);
    expect(total).toBe(
      "photo-bytes".length + "video-bytes".length + "pet-bytes".length + "legacy-bytes".length,
    );
  });

  /**
   * 예전에는 진짜 사본이라 백업 한 번이 원본만큼의 디스크를 더 먹었다. `files/`는
   * UPLOAD_DIR 안이라 늘 같은 파일시스템이므로 링크로 잇는다 — 크기와 무관하게 즉시고
   * 자리를 차지하지 않는다.
   */
  it("links staged files instead of copying their bytes", async () => {
    await seedUploads();

    await copyUploadsForBackup(uploadDir, filesDir, "backup-work");

    const source = await stat(path.join(uploadDir, "events", "evt-2.mp4"));
    const staged = await stat(path.join(filesDir, "events", "evt-2.mp4"));
    expect(staged.ino).toBe(source.ino);
    expect(staged.nlink).toBe(2);
  });

  // 아카이브 안에서의 자리를 알려준다 — 압축 진행률이 이 경로로 크기를 되찾는다
  it("names each staged file by its path inside the archive", async () => {
    await seedUploads();
    const seen: string[] = [];

    await copyUploadsForBackup(uploadDir, filesDir, "backup-work", (_bytes, rel) => seen.push(rel));

    expect(seen).toContain("events/evt-1.jpg");
    expect(seen).toContain("pets/pet-1.webp");
    expect(seen).toContain("legacy-flat.jpg");
  });

  /**
   * 중복 제거로 하드링크된 첨부가 복원에서 풀리면 **복원 한 번에 중복 제거가 통째로
   * 되돌아간다.** 아홉 벌이 다시 아홉 벌이 된다.
   */
  it("keeps deduped attachments linked through a restore", async () => {
    await mkdir(path.join(filesDir, "events"), { recursive: true });
    const first = path.join(filesDir, "events", "clip-a.mp4");
    await writeFile(first, "shared-video-bytes");
    await link(first, path.join(filesDir, "events", "clip-b.mp4"));

    await restoreUploadsFromBackup(filesDir, uploadDir);

    const a = await stat(path.join(uploadDir, "events", "clip-a.mp4"));
    const b = await stat(path.join(uploadDir, "events", "clip-b.mp4"));
    expect(b.ino).toBe(a.ino);
    expect(await readFile(path.join(uploadDir, "events", "clip-b.mp4"), "utf8")).toBe(
      "shared-video-bytes",
    );
  });

  // 서로 다른 파일은 각자 남아야 한다 — 링크 재사용이 남의 내용을 덮으면 안 된다
  it("does not link unrelated files together on restore", async () => {
    await mkdir(path.join(filesDir, "events"), { recursive: true });
    await writeFile(path.join(filesDir, "events", "one.jpg"), "first");
    await writeFile(path.join(filesDir, "events", "two.jpg"), "second");

    await restoreUploadsFromBackup(filesDir, uploadDir);

    expect(await readFile(path.join(uploadDir, "events", "one.jpg"), "utf8")).toBe("first");
    expect(await readFile(path.join(uploadDir, "events", "two.jpg"), "utf8")).toBe("second");
  });

  /**
   * 덮어쓸 때 기존 아이노드에 덧쓰면 그 파일에 걸린 **다른 이름의 내용까지** 바뀐다.
   * 중복 제거가 하드링크를 쓰기 시작한 뒤로는 남의 기록을 덮는 길이다.
   */
  it("replaces an existing file instead of writing through its inode", async () => {
    await mkdir(path.join(uploadDir, "events"), { recursive: true });
    const existing = path.join(uploadDir, "events", "keep.jpg");
    await writeFile(existing, "original");
    const sibling = path.join(uploadDir, "events", "sibling.jpg");
    await link(existing, sibling);

    await mkdir(path.join(filesDir, "events"), { recursive: true });
    await writeFile(path.join(filesDir, "events", "keep.jpg"), "restored");

    await restoreUploadsFromBackup(filesDir, uploadDir);

    expect(await readFile(existing, "utf8")).toBe("restored");
    // 같은 아이노드를 가리키던 다른 기록은 건드리지 않는다
    expect(await readFile(sibling, "utf8")).toBe("original");
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
