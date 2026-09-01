import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getCachedTokenVersion } from "./tokenVersion.js";

export const MEDIA_COOKIE_NAME = "kibble_media";
/**
 * 미디어 쿠키 수명 — /api/auth/me가 앱 부팅마다 갱신하므로 24h로 둬도 된다.
 * (API JWT 30d와 별개; me가 쿠키를 슬라이딩 갱신한다.)
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

/**
 * tv 클레임을 함께 심는다 — 없으면 /logout-all·비밀번호 변경 후에도 다른 기기의
 * 미디어 쿠키가 최대 24h 살아남아 사진을 계속 열 수 있다(tokenVersion 무효화 우회).
 */
export function signMediaToken(app: FastifyInstance, userId: string, tokenVersion: number): string {
  return app.jwt.sign(
    { sub: userId, purpose: "media", tv: tokenVersion },
    { expiresIn: MEDIA_TOKEN_EXPIRES },
  );
}

export function setMediaCookie(
  app: FastifyInstance,
  reply: FastifyReply,
  userId: string,
  tokenVersion: number,
): void {
  reply.setCookie(
    MEDIA_COOKIE_NAME,
    signMediaToken(app, userId, tokenVersion),
    mediaCookieOptions(),
  );
}

export function clearMediaCookie(reply: FastifyReply): void {
  reply.clearCookie(MEDIA_COOKIE_NAME, clearMediaCookieOptions());
}

export function isMediaAuthDisabled(): boolean {
  return process.env.MEDIA_AUTH_DISABLED === "true";
}

/**
 * 이 플래그는 첨부 라우트의 인증을 통째로 끈다 — 로컬 dev의 교차 오리진 전용이다.
 * JWT_SECRET과 같은 강도로 막는다: 프로덕션에서 켜져 있으면 경고가 아니라 기동 실패다.
 */
export function assertMediaAuthConfig(): void {
  if (!isMediaAuthDisabled()) return;
  if (process.env.NODE_ENV === "production") {
    console.error(
      "FATAL: MEDIA_AUTH_DISABLED=true is not allowed in production — it makes every attachment publicly readable. Remove it from the environment.",
    );
    process.exit(1);
  }
  console.warn(
    "WARNING: MEDIA_AUTH_DISABLED=true — attachment file routes are unauthenticated. Do not use this in production.",
  );
}

/** 미디어 토큰(쿠키·Bearer 공통)의 tv가 현재 tokenVersion과 일치하는지 확인한다. */
async function mediaTokenStillValid(userId: string, tv: unknown): Promise<boolean> {
  if (typeof tv !== "number") return false;
  const dbTv = await getCachedTokenVersion(userId);
  return dbTv !== null && dbTv === tv;
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
      const decoded = app.jwt.verify<{ sub: string; purpose?: string; tv?: unknown }>(cookieToken);
      if (
        decoded.purpose === "media" &&
        decoded.sub &&
        (await mediaTokenStillValid(decoded.sub, decoded.tv))
      ) {
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
        if (!(await mediaTokenStillValid(request.user.sub, request.user.tv))) {
          reply.code(401).send({ error: "unauthorized" });
          return { ok: false };
        }
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
