import { z } from "zod";

const POSTGRES_INT_MAX = 2_147_483_647;

export const PRODUCT_CATEGORIES = [
  "MEAL",
  "SUPPLEMENT",
  "TREAT",
  "HYGIENE",
  "DEVICE",
  "OTHER",
] as const;

export const productCategorySchema = z.enum(PRODUCT_CATEGORIES);
export type ProductCategory = z.infer<typeof productCategorySchema>;

export const PALATABILITIES = ["HIGH", "MEDIUM", "LOW"] as const;
export const palatabilitySchema = z.enum(PALATABILITIES);
export type Palatability = z.infer<typeof palatabilitySchema>;

/** 경량화된 이벤트 관계용 제품 요약 타입 (전성분·메모 등 대형 필드 제외) */
export interface ProductSummary {
  id: string;
  name: string;
  brand: string | null;
  category: ProductCategory;
  photoPath: string | null;
  dosage: string | null;
  isActive: boolean;
}

function isValidHttpUrl(val: string): boolean {
  try {
    const parsed = new URL(val);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export const safeUrlSchema = z
  .string()
  .trim()
  .max(1000)
  .refine((val) => !val || isValidHttpUrl(val), {
    message: "Must be a valid http or https URL",
  })
  .transform((val) => val || null)
  .nullable()
  .optional();

export const createProductSchema = z.object({
  name: z.string().trim().min(1, "Product name is required").max(120),
  brand: z.string().trim().max(120).nullable().optional(),
  category: productCategorySchema.default("MEAL"),
  petId: z.string().trim().min(1).nullable().optional(),
  purchaseUrl: safeUrlSchema,
  dosage: z.string().trim().max(500).nullable().optional(),
  ingredients: z.string().trim().max(4000).nullable().optional(),
  expiryDate: z.string().datetime().nullable().optional(),
  openedAt: z.string().datetime().nullable().optional(),
  purchaseDate: z.string().datetime().nullable().optional(),
  costKrw: z.coerce.number().int().min(0).max(POSTGRES_INT_MAX).nullable().optional(),
  isActive: z.boolean().default(true),
  palatability: palatabilitySchema.nullable().optional(),
  adverseReactions: z.array(z.string().trim().max(50)).max(20).optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    brand: z.string().trim().max(120).nullable().optional(),
    category: productCategorySchema.optional(),
    petId: z.string().trim().min(1).nullable().optional(),
    purchaseUrl: safeUrlSchema,
    dosage: z.string().trim().max(500).nullable().optional(),
    ingredients: z.string().trim().max(4000).nullable().optional(),
    expiryDate: z.string().datetime().nullable().optional(),
    openedAt: z.string().datetime().nullable().optional(),
    purchaseDate: z.string().datetime().nullable().optional(),
    costKrw: z.coerce.number().int().min(0).max(POSTGRES_INT_MAX).nullable().optional(),
    isActive: z.boolean().optional(),
    palatability: palatabilitySchema.nullable().optional(),
    adverseReactions: z.array(z.string().trim().max(50)).max(20).optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "empty update" });

export type UpdateProductInput = z.infer<typeof updateProductSchema>;
