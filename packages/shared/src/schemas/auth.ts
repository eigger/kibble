import { z } from "zod";

/**
 * 로그인 식별자. 앞뒤 공백을 자르고 소문자로 정규화한다 — 대소문자만 다른 중복 계정과, 관리자가
 * `Mom@Example.com`으로 만든 계정에 `mom@example.com`으로 로그인하지 못하는 일을 막는다.
 * 기존에 대문자가 섞여 저장된 행은 서버가 대소문자 무시로 찾는다 (일괄 변환 마이그레이션은 하지 않는다).
 */
export const emailSchema = z.string().trim().toLowerCase().email();

export const bootstrapAdminSchema = z.object({
  name: z.string().min(1),
  email: emailSchema,
  password: z.string().min(8),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const createUserSchema = z.object({
  name: z.string().min(1),
  email: emailSchema,
  password: z.string().min(8),
  role: z.enum(["ADMIN", "GENERAL"]).default("GENERAL"),
  /** JOIN: 관리자 Household에 합류. SEPARATE: 새 Household(별도 일지) — WORKPLAN §7.12 */
  householdMode: z.enum(["JOIN", "SEPARATE"]).default("JOIN"),
  /** JOIN일 때만 적용 */
  householdRole: z.enum(["MEMBER", "VIEWER"]).default("MEMBER"),
});

export const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  email: emailSchema.optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).optional(),
});

export type BootstrapAdminInput = z.infer<typeof bootstrapAdminSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
