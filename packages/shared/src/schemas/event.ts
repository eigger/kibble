import { z } from "zod";

const decimalOptional = z.coerce.number().finite().optional();

export const eventSourceSchema = z.enum(["WEB", "QUICK", "API"]);

export const createEventSchema = z.object({
  petId: z.string().trim().min(1).optional(),
  presetId: z.string().trim().min(1).optional(),
  eventTypeId: z.string().trim().min(1).optional(),
  occurredAt: z.string().datetime().optional(),
  quantity: decimalOptional,
  quantityOffered: decimalOptional,
  unit: z.string().trim().max(32).optional(),
  scaleValue: z.coerce.number().int().optional(),
  note: z.string().trim().max(4000).optional(),
  rawText: z.string().trim().max(8000).optional(),
  entryId: z.string().trim().min(1).optional(),
  needsReview: z.boolean().optional(),
  source: eventSourceSchema.optional(),
  dedupeKey: z.string().trim().min(1).max(200).optional(),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;

export const updateEventSchema = z
  .object({
    occurredAt: z.string().datetime().optional(),
    quantity: decimalOptional.nullable(),
    quantityOffered: decimalOptional.nullable(),
    unit: z.string().trim().max(32).nullable().optional(),
    scaleValue: z.coerce.number().int().nullable().optional(),
    note: z.string().trim().max(4000).nullable().optional(),
    needsReview: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "empty update" });

export type UpdateEventInput = z.infer<typeof updateEventSchema>;
