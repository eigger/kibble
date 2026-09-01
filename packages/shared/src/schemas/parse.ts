import { z } from "zod";

export const parseEntrySchema = z.object({
  petId: z.string().trim().min(1),
  text: z.string().trim().min(1).max(8000),
});

export type ParseEntryInput = z.infer<typeof parseEntrySchema>;
