import { z } from "zod";

export const speciesSchema = z.enum(["DOG", "CAT", "OTHER"]);
export const sexSchema = z.enum(["MALE", "FEMALE", "UNKNOWN"]);

/** ISO 8601 instant or YYYY-MM-DD — API 계약용. 무효값은 400. */
const optionalDateField = z
  .string()
  .optional()
  .nullable()
  .superRefine((val, ctx) => {
    if (val === undefined || val === null || val === "") return;
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "invalidDate" });
    }
  });

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
    birthDate: optionalDateField,
    adoptionDate: optionalDateField,
    /** 자유 텍스트 — Phase 1은 국가별 형식 검증하지 않는다 (공개·다국어). */
    registrationNo: z.string().trim().max(50).optional().nullable(),
    microchipNo: z.string().trim().max(50).optional().nullable(),
    color: z.string().trim().max(100).optional().nullable(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
  })
  .superRefine((data, ctx) => {
    if (Object.keys(data).length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "emptyUpdate" });
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
