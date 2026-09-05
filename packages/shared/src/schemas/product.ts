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

/** 제형. 사료(건식·습식·반습식)와 영양제(파우더·캡슐·정제·액상)를 한 목록으로 덮는다. */
export const PRODUCT_FORMS = [
  "DRY",
  "WET",
  "SEMI_MOIST",
  "POWDER",
  "CAPSULE",
  "TABLET",
  "LIQUID",
] as const;
export const productFormSchema = z.enum(PRODUCT_FORMS);
export type ProductForm = z.infer<typeof productFormSchema>;

/** 알갱이 크기. 건식에서만 의미가 있다. */
export const KIBBLE_SIZES = ["SMALL", "MEDIUM", "LARGE"] as const;
export const kibbleSizeSchema = z.enum(KIBBLE_SIZES);
export type KibbleSize = z.infer<typeof kibbleSizeSchema>;

/** 제형·입자크기·원산지·중량을 입력받는 카테고리. 기기·위생용품에는 안 묻는다. */
export const FORM_DETAIL_CATEGORIES = ["MEAL", "SUPPLEMENT", "TREAT"] as const;

export function hasFormDetails(category: ProductCategory): boolean {
  return (FORM_DETAIL_CATEGORIES as readonly string[]).includes(category);
}

/** 알갱이 크기는 건식일 때만 남긴다 — 습식 사료에 "소립"이 붙어 있으면 거짓 정보다. */
export function kibbleSizeForForm(
  form: ProductForm | null | undefined,
  kibbleSize: KibbleSize | null | undefined,
): KibbleSize | null {
  if (form !== "DRY") return null;
  return kibbleSize ?? null;
}

/** 제품 사진 장수 상한. 기록 첨부(MAX_ATTACHMENTS_PER_EVENT)와 같은 값으로 맞춘다. */
export const MAX_PRODUCT_PHOTOS = 9;

/**
 * 대표 사진이 지워졌을 때 남은 사진 중 무엇을 대표로 올릴지.
 * 정렬 순서를 그대로 따른다 — 사용자가 다시 고르기 전까지 첫 장이 대표다.
 */
export function nextPrimaryPhotoPath(
  remaining: { path: string; sortOrder: number }[],
): string | null {
  if (remaining.length === 0) return null;
  return [...remaining].sort((a, b) => a.sortOrder - b.sortOrder)[0].path;
}

/** 2kg이면 2000. 저장은 g으로 통일하고 입력 단위는 UI가 고른다. */
export const WEIGHT_G_MAX = 1_000_000;

/** 입력값(문자열) + 단위 → 저장용 g 정수. 비었거나 숫자가 아니면 null. */
export function weightToGrams(raw: string, unit: "kg" | "g"): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  const grams = Math.round(unit === "kg" ? n * 1000 : n);
  if (grams <= 0) return null;
  return Math.min(grams, WEIGHT_G_MAX);
}

/** 소수점 뒤 남는 0을 떼고 문자열로. 2.50 → "2.5", 2.00 → "2" */
function trimNumber(value: number): string {
  return String(Number(value.toFixed(3)));
}

/**
 * 저장된 g → 사람이 읽는 문자열. 1kg 이상이면 kg으로 쓴다.
 *
 * 예전에는 100g 단위로 떨어질 때만 kg으로 썼는데, 그러면 1.25kg짜리를 넣고
 * "1250g"으로 돌려받는다 — 사용자가 적은 소수점이 사라져 보인다.
 */
export function formatWeightG(grams: number | null | undefined): string | null {
  if (grams == null || grams <= 0) return null;
  if (grams >= 1000) return `${trimNumber(grams / 1000)}kg`;
  return `${grams}g`;
}

/** 저장된 g → 입력 칸에 되돌릴 값과 단위. formatWeightG와 같은 기준을 쓴다. */
export function weightToInput(grams: number | null | undefined): {
  value: string;
  unit: "kg" | "g";
} {
  if (grams == null || grams <= 0) return { value: "", unit: "kg" };
  if (grams >= 1000) return { value: trimNumber(grams / 1000), unit: "kg" };
  return { value: String(grams), unit: "g" };
}


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
  origin: z.string().trim().max(80).nullable().optional(),
  form: productFormSchema.nullable().optional(),
  kibbleSize: kibbleSizeSchema.nullable().optional(),
  weightG: z.coerce.number().int().min(0).max(WEIGHT_G_MAX).nullable().optional(),
  dosage: z.string().trim().max(500).nullable().optional(),
  mainIngredients: z.string().trim().max(200).nullable().optional(),
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
    origin: z.string().trim().max(80).nullable().optional(),
    form: productFormSchema.nullable().optional(),
    kibbleSize: kibbleSizeSchema.nullable().optional(),
    weightG: z.coerce.number().int().min(0).max(WEIGHT_G_MAX).nullable().optional(),
    dosage: z.string().trim().max(500).nullable().optional(),
    mainIngredients: z.string().trim().max(200).nullable().optional(),
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
