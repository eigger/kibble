import "fastify";
import type { Role } from "@prisma/client";
import type { ApiTokenAuthContext, AuthMethod } from "../lib/authenticate.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireSession: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    locale: "ko" | "en";
    /** K-2: authenticate가 사용자 멤버십 또는 ApiToken에서 결정한다. */
    householdId: string | null;
    householdRole: Role | null;
    authMethod: AuthMethod;
    apiTokenContext: ApiTokenAuthContext | null;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    // role은 API 토큰에만 필수. 미디어 쿠키 토큰은 purpose:"media"만 담는다.
    payload: { sub: string; role?: "ADMIN" | "GENERAL"; tv?: number; purpose?: string; jti?: string };
    user: { sub: string; role?: "ADMIN" | "GENERAL"; tv?: number; purpose?: string; jti?: string };
  }
}
