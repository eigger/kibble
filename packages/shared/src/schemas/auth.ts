import { z } from "zod";

export const bootstrapAdminSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "GENERAL"]).default("GENERAL"),
  /** JOIN: 관리자 Household에 합류. SEPARATE: 새 Household(별도 일지) — WORKPLAN §7.12 */
  householdMode: z.enum(["JOIN", "SEPARATE"]).default("JOIN"),
  /** JOIN일 때만 적용 */
  householdRole: z.enum(["MEMBER", "VIEWER"]).default("MEMBER"),
});

export const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).optional(),
});

export type BootstrapAdminInput = z.infer<typeof bootstrapAdminSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
