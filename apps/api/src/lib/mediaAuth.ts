import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getCachedTokenVersion } from "./tokenVersion.js";

export const MEDIA_COOKIE_NAME = "kibble_media";
/**
 * 미디어 쿠키 수명 — /api/auth/me가 앱 부팅마다 갱신하므로 24h로 둬도 된다.
 * (JWT 7d와 별개; me가 쿠키를 슬라이딩 갱신한다.)
 */
export const MEDIA_TOKEN_EXPIRES = "24h";
const MEDIA_COOKIE_MAX_AGE_SEC = 60 * 60 * 24;

export function mediaCookieOptions() {
  return {
    path: "/api/attachments/file",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: MEDIA_COOKIE_MAX_AGE_SEC,
  };
}

export function clearMediaCookieOptions() {
  return {
    path: "/api/attachments/file",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.COOKIE_SECURE === "true",
  };
}

export function signMediaToken(app: FastifyInstance, userId: string): string {
  return app.jwt.sign({ sub: userId, purpose: "media" }, { expiresIn: MEDIA_TOKEN_EXPIRES });
}

export function setMediaCookie(app: FastifyInstance, reply: FastifyReply, userId: string): void {
  reply.setCookie(MEDIA_COOKIE_NAME, signMediaToken(app, userId), mediaCookieOptions());
}

export function clearMediaCookie(reply: FastifyReply): void {
  reply.clearCookie(MEDIA_COOKIE_NAME, clearMediaCookieOptions());
}

export function isMediaAuthDisabled(): boolean {
  return process.env.MEDIA_AUTH_DISABLED === "true";
}

export type MediaAccessResult =
  | { ok: true; userId: string }
  | { ok: true; authDisabled: true }
  | { ok: false };

/**
 * 첨부 파일 라우트 인증.
 * kibble_media 쿠키(purpose:media) 또는 유효한 API Bearer JWT.
 * 성공 시 userId를 반환해 호출부가 가구 멤버십을 한 번만 조회하게 한다.
 */
export async function requireMediaAccess(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<MediaAccessResult> {
  if (isMediaAuthDisabled()) {
    return { ok: true, authDisabled: true };
  }

  const cookieToken = request.cookies?.[MEDIA_COOKIE_NAME];
  if (typeof cookieToken === "string" && cookieToken.length > 0) {
    try {
      const decoded = app.jwt.verify<{ sub: string; purpose?: string }>(cookieToken);
      if (decoded.purpose === "media" && decoded.sub) {
        return { ok: true, userId: decoded.sub };
      }
    } catch {
      // fall through
    }
  }

  const auth = request.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    try {
      await request.jwtVerify();
      if (request.user.purpose === "backup") {
        reply.code(401).send({ error: "unauthorized" });
        return { ok: false };
      }
      if (request.user.purpose === "media") {
        return { ok: true, userId: request.user.sub };
      }
      if (typeof request.user.tv !== "number") {
        reply.code(401).send({ error: "unauthorized" });
        return { ok: false };
      }
      const dbTv = await getCachedTokenVersion(request.user.sub);
      if (dbTv === null || dbTv !== request.user.tv) {
        reply.code(401).send({ error: "unauthorized" });
        return { ok: false };
      }
      return { ok: true, userId: request.user.sub };
    } catch {
      // fall through
    }
  }

  reply.code(401).send({ error: "unauthorized" });
  return { ok: false };
}
