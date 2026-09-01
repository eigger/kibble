import { z } from "zod";

export const speciesSchema = z.enum(["DOG", "CAT", "OTHER"]);
export const sexSchema = z.enum(["MALE", "FEMALE", "UNKNOWN"]);

export const createPetSchema = z.object({
  name: z.string().trim().min(1).max(100),
  species: speciesSchema,
});

export const updatePetSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    species: speciesSchema.optional(),
    breed: z.string().trim().max(100).optional().nullable(),
    sex: sexSchema.optional().nullable(),
    neutered: z.boolean().optional(),
    birthDate: z.string().optional().nullable(),
    adoptionDate: z.string().optional().nullable(),
    registrationNo: z.string().trim().optional().nullable(),
    microchipNo: z.string().trim().max(50).optional().nullable(),
    color: z.string().trim().max(100).optional().nullable(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
  })
  .superRefine((data, ctx) => {
    if (Object.keys(data).length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "emptyUpdate" });
    }
    if (data.registrationNo != null && data.registrationNo !== "") {
      if (!/^\d{15}$/.test(data.registrationNo)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["registrationNo"],
          message: "registrationNoFormat",
        });
      }
    }
  });

export type CreatePetInput = z.infer<typeof createPetSchema>;
export type UpdatePetInput = z.infer<typeof updatePetSchema>;

export type PetSummary = {
  id: string;
  name: string;
  species: z.infer<typeof speciesSchema>;
  sortOrder: number;
  photoPath: string | null;
};

export type PetDetail = PetSummary & {
  breed: string | null;
  sex: z.infer<typeof sexSchema> | null;
  neutered: boolean;
  birthDate: string | null;
  adoptionDate: string | null;
  registrationNo: string | null;
  microchipNo: string | null;
  color: string | null;
};
