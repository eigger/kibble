import { z } from "zod";

export const speciesSchema = z.enum(["DOG", "CAT", "OTHER"]);

export const createPetSchema = z.object({
  name: z.string().trim().min(1).max(100),
  species: speciesSchema,
});

export type CreatePetInput = z.infer<typeof createPetSchema>;
