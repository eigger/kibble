import { z } from "zod";

export const createApiTokenSchema = z.object({
  name: z.string().trim().min(1).max(100),
  presetId: z.string().trim().min(1).optional(),
  petId: z.string().trim().min(1).optional(),
  eventTypeId: z.string().trim().min(1).optional(),
  expiresAt: z.string().datetime().optional(),
});

export type CreateApiTokenInput = z.infer<typeof createApiTokenSchema>;
