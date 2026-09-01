import { buildApp } from "./app.js";
import { startTrashPurgeJob } from "./jobs/trashPurge.js";
import { startMedicationReminderJob } from "./jobs/medicationReminders.js";
import { isMediaAuthDisabled } from "./lib/mediaAuth.js";
import { prisma } from "./lib/prisma.js";
import { seedSystemEventTypes } from "./lib/seed/systemEventTypes.js";

if (isMediaAuthDisabled()) {
  console.warn(
    "WARNING: MEDIA_AUTH_DISABLED=true — attachment file routes are unauthenticated. Do not use this in production.",
  );
}

const app = await buildApp();

startTrashPurgeJob();
startMedicationReminderJob();

const port = Number(process.env.PORT ?? 8080);

const eventTypeSeed = await seedSystemEventTypes(prisma);
if (eventTypeSeed.created > 0 || eventTypeSeed.updated > 0) {
  app.log.info(eventTypeSeed, "system event types seeded on startup");
}

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
