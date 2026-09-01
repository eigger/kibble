import { z } from "zod";

export const medicationReminderPrefsSchema = z.object({
  enabled: z.boolean(),
  leadMinutes: z.coerce.number().int().min(0).max(120),
  overdueMinutes: z.coerce.number().int().min(0).max(180),
});

export type MedicationReminderPrefs = z.infer<typeof medicationReminderPrefsSchema>;

export const DEFAULT_MEDICATION_REMINDER_PREFS: MedicationReminderPrefs = {
  enabled: false,
  leadMinutes: 5,
  overdueMinutes: 10,
};

export type MedicationPushKind = "lead" | "overdue";

export function parseMedicationReminderPrefs(raw: string | null | undefined): MedicationReminderPrefs {
  if (!raw) return DEFAULT_MEDICATION_REMINDER_PREFS;
  try {
    return medicationReminderPrefsSchema.parse(JSON.parse(raw));
  } catch {
    return DEFAULT_MEDICATION_REMINDER_PREFS;
  }
}

export function medicationReminderSettingKey(householdId: string): string {
  return `household:${householdId}:medicationReminder`;
}

/** 복약 슬롯에 대해 지금 보낼 푸시 종류를 계산한다. */
export function dueMedicationPushKinds(params: {
  now: Date;
  doseAt: Date;
  logged: boolean;
  prefs: MedicationReminderPrefs;
  sentKinds: Set<MedicationPushKind>;
}): MedicationPushKind[] {
  const { now, doseAt, logged, prefs, sentKinds } = params;
  if (!prefs.enabled || logged) return [];

  const kinds: MedicationPushKind[] = [];

  const leadNotifyAt = new Date(doseAt.getTime() - prefs.leadMinutes * 60_000);
  const leadWindowEnd =
    prefs.leadMinutes > 0 ? doseAt : new Date(doseAt.getTime() + 60_000);
  if (!sentKinds.has("lead") && now >= leadNotifyAt && now < leadWindowEnd) {
    kinds.push("lead");
  }

  const overdueAt = new Date(doseAt.getTime() + prefs.overdueMinutes * 60_000);
  if (!sentKinds.has("overdue") && now >= overdueAt) {
    kinds.push("overdue");
  }

  return kinds;
}
