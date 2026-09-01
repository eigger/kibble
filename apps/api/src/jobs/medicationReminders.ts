import cron from "node-cron";
import { processMedicationReminderPushes } from "../lib/medicationReminderPush.js";

export function startMedicationReminderJob(): void {
  const run = () => {
    processMedicationReminderPushes()
      .then((sent) => {
        if (sent > 0) console.info(`[medication-reminder] sent ${sent} push(es)`);
      })
      .catch((err) => console.error("[medication-reminder] failed", err));
  };

  run();
  cron.schedule("* * * * *", run);
}
