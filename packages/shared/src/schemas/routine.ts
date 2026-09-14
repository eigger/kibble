import { z } from "zod";

const decimalOptional = z.coerce.number().finite().optional().nullable();
const labelField = z.string().trim().min(1).max(100);

export const ROUTINE_ITEM_MAX = 20;

/** 루틴 항목 — 미리 정해 두는 값. 이벤트 한 건이 된다 (WORKPLAN §7.24). */
export const routineItemSchema = z.object({
  eventTypeId: z.string().trim().min(1),
  /** 같은 타입의 칩. 이벤트에 실려 타임라인 라벨이 칩과 같아진다 */
  presetId: z.string().trim().min(1).optional().nullable(),
  productId: z.string().trim().min(1).optional().nullable(),
  productName: z.string().trim().max(120).optional().nullable(),
  quantity: decimalOptional,
  unit: z.string().trim().max(32).optional().nullable(),
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

export type RoutineItemInput = z.infer<typeof routineItemSchema>;
export type CreateRoutineInput = z.infer<typeof createRoutineSchema>;
export type UpdateRoutineInput = z.infer<typeof updateRoutineSchema>;
