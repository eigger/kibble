import { z } from "zod";
import { DOSE_TIME_RE } from "../doseTimes.js";

const doseTimeSchema = z.string().regex(DOSE_TIME_RE, "invalid dose time");

export const createMedicationCourseSchema = z.object({
  petId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(120),
  dosesPerDay: z.coerce.number().int().min(1).max(24).optional(),
  doseTimes: z.array(doseTimeSchema).max(24).optional(),
  /** @deprecated use doseTimes */
  doseSlotKeys: z.array(z.string()).max(24).optional(),
  totalDoses: z.coerce.number().int().min(1).max(9999).nullable().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
});

export type CreateMedicationCourseInput = z.infer<typeof createMedicationCourseSchema>;

export const updateMedicationCourseSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    dosesPerDay: z.coerce.number().int().min(1).max(24).optional(),
    doseTimes: z.array(doseTimeSchema).max(24).optional(),
    doseSlotKeys: z.array(z.string()).max(24).optional(),
    totalDoses: z.coerce.number().int().min(1).max(9999).nullable().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().nullable().optional(),
    note: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "empty update" });

export type UpdateMedicationCourseInput = z.infer<typeof updateMedicationCourseSchema>;

export const logMedicationDoseSchema = z.object({
  doseSlotIndex: z.coerce.number().int().min(0).max(23).optional(),
});

export type LogMedicationDoseInput = z.infer<typeof logMedicationDoseSchema>;
