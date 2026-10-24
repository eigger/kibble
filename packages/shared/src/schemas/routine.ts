import { z } from "zod";
import { PRODUCT_NAME_MAX } from "../eventTypeKeys.js";

const decimalOptional = z.coerce.number().finite().optional().nullable();
const labelField = z.string().trim().min(1).max(100);

export const ROUTINE_ITEM_MAX = 20;

/** 루틴 항목 — 미리 정해 두는 값. 이벤트 한 건이 된다 (WORKPLAN §7.24). */
export const routineItemSchema = z.object({
  eventTypeId: z.string().trim().min(1),
  /** 같은 타입의 칩. 이벤트에 실려 타임라인 라벨이 칩과 같아진다 */
  presetId: z.string().trim().min(1).optional().nullable(),
  productId: z.string().trim().min(1).optional().nullable(),
  productName: z.string().trim().max(PRODUCT_NAME_MAX).optional().nullable(),
  quantity: decimalOptional,
  /** 사료 항목의 제공량. `quantity`는 섭취량이다 */
  quantityOffered: decimalOptional,
  unit: z.string().trim().max(32).optional().nullable(),
  /** 투약 항목의 처방. `medication` 타입이면 필수다 — 슬롯은 실행 때 서버가 고른다 */
  medicationCourseId: z.string().trim().min(1).optional().nullable(),
});

const itemsField = z.array(routineItemSchema).min(1).max(ROUTINE_ITEM_MAX);

export const createRoutineSchema = z.object({
  petId: z.string().trim().min(1),
  label: labelField,
  sortOrder: z.number().int().min(0).max(9999).optional(),
  items: itemsField,
});

export const updateRoutineSchema = z
  .object({
    label: labelField.optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    /** 있으면 항목 전체를 이 목록으로 바꾼다 */
    items: itemsField.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "empty update" });

/** 재배치 본문(`ids`)의 상한 — 루틴 수 제한이 아니라 요청 크기 제한이다 */
export const ROUTINE_ORDER_MAX = 200;

/**
 * 루틴 순서 재배치. `ids`가 앞에서부터의 새 순서다.
 * 중복 id는 처음 것만 남기고 무시한다 (K-12 — 거부당하는 입력이 없다).
 * 목록에 없는 루틴은 서버가 기존 상대 순서대로 뒤에 붙인다.
 */
export const reorderRoutinesSchema = z.object({
  petId: z.string().trim().min(1),
  ids: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(ROUTINE_ORDER_MAX)
    .transform((ids) => [...new Set(ids)]),
});

export type RoutineItemInput = z.infer<typeof routineItemSchema>;
export type CreateRoutineInput = z.infer<typeof createRoutineSchema>;
export type UpdateRoutineInput = z.infer<typeof updateRoutineSchema>;
export type ReorderRoutinesInput = z.infer<typeof reorderRoutinesSchema>;
