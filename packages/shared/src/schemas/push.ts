import { z } from "zod";
import { medicationReminderPrefsSchema } from "../medicationReminder.js";

export const pushSubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().trim().min(1),
    auth: z.string().trim().min(1),
  }),
  locale: z.enum(["ko", "en"]).optional(),
});

export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

export type PushUnsubscribeInput = z.infer<typeof pushUnsubscribeSchema>;

export { medicationReminderPrefsSchema };
export type { MedicationReminderPrefs } from "../medicationReminder.js";
