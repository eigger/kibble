import { z } from "zod";
import { dedupeAliases } from "../aliasUtils.js";

const decimalOptional = z.coerce.number().finite().optional().nullable();
const labelField = z.string().trim().min(1).max(100);

export const createPresetSchema = z.object({
  petId: z.string().trim().min(1),
  eventTypeId: z.string().trim().min(1),
  label: labelField,
  quantity: decimalOptional,
  unit: z.string().trim().max(32).optional().nullable(),
  note: z.string().trim().max(4000).optional().nullable(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export const updatePresetSchema = z
  .object({
    label: labelField.optional(),
    quantity: decimalOptional,
    unit: z.string().trim().max(32).optional().nullable(),
    note: z.string().trim().max(4000).optional().nullable(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    /** true = 숨김, false = 다시 표시 */
    hidden: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "empty update" });

export const updateEventTypeAliasesSchema = z.object({
  aliases: z
    .array(z.string().trim().min(1).max(50))
    .max(30)
    .transform(dedupeAliases),
});

export type CreatePresetInput = z.infer<typeof createPresetSchema>;
export type UpdatePresetInput = z.infer<typeof updatePresetSchema>;
export type UpdateEventTypeAliasesInput = z.infer<typeof updateEventTypeAliasesSchema>;

export type PresetSummary = {
  id: string;
  petId: string | null;
  eventTypeId: string;
  label: string;
  isStarter: boolean;
  sortOrder: number;
  hiddenAt: string | null;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  eventType: { key: string; label: string };
};
