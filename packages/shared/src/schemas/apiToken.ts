import { z } from "zod";

/**
 * 토큰 권한. `event:create`는 기록 생성(POST /api/events),
 * `state:read`는 현재 상태 조회(GET /api/states)다.
 * 기존 토큰은 `event:create`만 갖고 있으므로 상태 조회를 하려면 새로 발급해야 한다.
 */
export const apiTokenScopeSchema = z.enum(["event:create", "state:read"]);
export type ApiTokenScope = z.infer<typeof apiTokenScopeSchema>;

export const EVENT_CREATE_SCOPE = "event:create" as const;
export const STATE_READ_SCOPE = "state:read" as const;

export const createApiTokenSchema = z.object({
  name: z.string().trim().min(1).max(100),
  // 생략하면 기존 동작 그대로 — 기록 생성만 되는 토큰
  scopes: z.array(apiTokenScopeSchema).nonempty().optional(),
  presetId: z.string().trim().min(1).optional(),
  petId: z.string().trim().min(1).optional(),
  eventTypeId: z.string().trim().min(1).optional(),
  expiresAt: z.string().datetime().optional(),
});

export type CreateApiTokenInput = z.infer<typeof createApiTokenSchema>;
