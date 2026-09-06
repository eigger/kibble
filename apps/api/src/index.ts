import { buildApp } from "./app.js";
import { startTrashPurgeJob } from "./jobs/trashPurge.js";
import { startMedicationReminderJob } from "./jobs/medicationReminders.js";
import { startVideoTranscodeJob } from "./jobs/videoTranscode.js";
import { assertMediaAuthConfig } from "./lib/mediaAuth.js";
import { prisma } from "./lib/prisma.js";
import { seedSystemEventTypes } from "./lib/seed/systemEventTypes.js";
import { sweepStaleUploadSessions } from "./lib/uploadSessions.js";
import { sweepStaleBackupWorkspaces } from "./lib/backupWorkspace.js";
import { UPLOAD_DIR } from "./lib/uploads.js";

assertMediaAuthConfig();

const app = await buildApp();

startTrashPurgeJob();
startMedicationReminderJob();
startVideoTranscodeJob();

setInterval(() => {
  sweepStaleUploadSessions().catch((err) => app.log.error(err, "청크 업로드 세션 정리 실패"));
}, 60 * 60 * 1000).unref();

/**
 * 백업 작업 디렉터리는 uploads 전체 사본이다 — 남으면 원본의 2배씩 쌓인다.
 * 프로세스가 죽거나 탭을 닫아 남은 것을 기동 시 한 번, 이후 매시간 걷는다.
 */
function sweepBackupWorkspaces(): void {
  sweepStaleBackupWorkspaces(UPLOAD_DIR)
    .then((swept) => {
      if (swept.length === 0) return;
      const bytes = swept.reduce((n, item) => n + item.bytes, 0);
      app.log.warn({ count: swept.length, bytes }, "백업 작업 디렉터리 정리");
    })
    .catch((err) => app.log.error(err, "백업 작업 디렉터리 정리 실패"));
}

sweepBackupWorkspaces();
setInterval(sweepBackupWorkspaces, 60 * 60 * 1000).unref();

const port = Number(process.env.PORT ?? 8080);

const eventTypeSeed = await seedSystemEventTypes(prisma);
if (eventTypeSeed.created > 0 || eventTypeSeed.updated > 0) {
  app.log.info(eventTypeSeed, "system event types seeded on startup");
}

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
