import cron from "node-cron";
import { prisma } from "../lib/prisma.js";
import { deleteUploadedFile } from "../lib/uploads.js";

/** stash와 동일 — 휴지통에 30일 넘게 남은 소프트삭제 이벤트를 영구 삭제한다. */
export const TRASH_RETENTION_DAYS = 30;

export function trashPurgeThreshold(now = new Date(), retentionDays = TRASH_RETENTION_DAYS): Date {
  const threshold = new Date(now);
  threshold.setDate(threshold.getDate() - retentionDays);
  return threshold;
}

export async function purgeOldTrash(now = new Date()): Promise<number> {
  const threshold = trashPurgeThreshold(now);

  const stale = await prisma.event.findMany({
    where: { deletedAt: { not: null, lte: threshold } },
    select: {
      id: true,
      attachments: { select: { path: true } },
    },
  });

  for (const event of stale) {
    await Promise.all(event.attachments.map((a) => deleteUploadedFile(a.path)));
    await prisma.event.delete({ where: { id: event.id } });
  }

  return stale.length;
}

export function startTrashPurgeJob(): void {
  purgeOldTrash().catch((err) => console.error("[trash-purge] initial run failed", err));
  cron.schedule("0 4 * * *", () => {
    purgeOldTrash().catch((err) => console.error("[trash-purge] scheduled run failed", err));
  });
}
