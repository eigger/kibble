import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  bootstrapAdminSchema,
  createUserSchema,
  loginSchema,
  updateProfileSchema,
} from "@kibble/shared";
import { prisma } from "../lib/prisma.js";
import { t } from "../lib/i18n.js";
import { bumpTokenVersion, invalidateTokenVersionCache } from "../lib/tokenVersion.js";
import { clearMediaCookie, setMediaCookie } from "../lib/mediaAuth.js";
import { isRecordNotFoundError, isUniqueConstraintError } from "../lib/prismaErrors.js";
import { JWT_EXPIRES_IN } from "../lib/jwtSecret.js";
import { householdWhere, requireHouseholdId, invalidateHouseholdCache } from "../lib/householdScope.js";

class BootstrapDisabledError extends Error {
  constructor() {
    super("BOOTSTRAP_DISABLED");
    this.name = "BootstrapDisabledError";
  }
}

export async function authRoutes(app: FastifyInstance) {
  app.get("/bootstrap/status", async () => {
    const userCount = await prisma.user.count();
    return { needsBootstrap: userCount === 0 };
  });

  app.post("/bootstrap/admin", async (request, reply) => {
    const parsed = bootstrapAdminSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return reply.code(409).send({ error: t("bootstrapDisabled", request.locale) });
    }

    const { name, email, password } = parsed.data;
    const passwordHash = await bcrypt.hash(password, 10);
    try {
      const user = await prisma.$transaction(async (tx) => {
        const existingCount = await tx.user.count();
        if (existingCount > 0) throw new BootstrapDisabledError();

        const created = await tx.user.create({
          data: { name, email, passwordHash, role: "ADMIN" },
        });
        const household = await tx.household.create({ data: { name: "우리 집" } });
        await tx.householdMember.create({
          data: { householdId: household.id, userId: created.id, role: "OWNER" },
        });
        return created;
      });
      invalidateHouseholdCache(user.id);
      return reply
        .code(201)
        .send({ id: user.id, name: user.name, email: user.email, role: user.role });
    } catch (err) {
      if (err instanceof BootstrapDisabledError) {
        return reply.code(409).send({ error: t("bootstrapDisabled", request.locale) });
      }
      if (isUniqueConstraintError(err)) {
        return reply.code(409).send({ error: t("emailAlreadyInUse", request.locale) });
      }
      throw err;
    }
  });

  app.post(
    "/login",
    // 무차별 대입 방어: IP당 15분에 10회로 제한.
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

      const { email, password } = parsed.data;
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return reply.code(401).send({ error: t("invalidCredentials", request.locale) });

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) return reply.code(401).send({ error: t("invalidCredentials", request.locale) });

      // tv 클레임으로 비밀번호 변경/로그아웃 시 기존 토큰을 무효화한다.
      const token = app.jwt.sign(
        { sub: user.id, role: user.role, tv: user.tokenVersion },
        { expiresIn: JWT_EXPIRES_IN },
      );

      // <img src>용 미디어 전용 httpOnly 쿠키. API JWT를 그대로 넣지 않고 짧은 수명·purpose 분리.
      setMediaCookie(app, reply, user.id);

      return {
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      };
    },
  );

  // 기본 로그아웃은 이 기기의 미디어 쿠키만 지운다. tokenVersion을 올리면 폰에서 로그아웃할 때
  // 주방 태블릿까지 끊기므로, 전 기기 무효화는 /logout-all 과 비밀번호 변경에만 둔다.
  // 트레이드오프: 기본 로그아웃 후에도 탈취된 Bearer는 최대 30일 유효하다(tokenVersion으로 즉시 무효화 가능).
  app.post("/logout", { preHandler: [app.authenticate] }, async (_request, reply) => {
    clearMediaCookie(reply);
    return reply.code(204).send();
  });

  app.post("/logout-all", { preHandler: [app.authenticate] }, async (request, reply) => {
    await bumpTokenVersion(request.user.sub);
    clearMediaCookie(reply);
    return reply.code(204).send();
  });

  app.get("/me", { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = await prisma.user.findUnique({ where: { id: request.user.sub } });
    if (!user) return reply.code(401).send({ error: t("userNotFound", request.locale) });
    // AuthProvider 마운트·탭 복귀(visibilitychange) 때마다 /me가 호출되므로
    // 여기서 미디어 쿠키를 슬라이딩 갱신한다. 로그인만 심으면 24h 뒤 JWT는 살아 있는데
    // 사진만 전부 401이 된다.
    setMediaCookie(app, reply, user.id);

    const householdId = request.householdId;
    let needsPet: boolean;
    if (!householdId) {
      needsPet = true;
    } else {
      const petCount = await prisma.pet.count({
        where: { ...householdWhere(householdId), archivedAt: null },
      });
      needsPet = petCount === 0;
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      householdId,
      needsPet,
    };
  });

  // 공개 회원가입은 없다 — 관리자만 가족 구성원 계정을 만들 수 있다.
  app.post(
    "/users",
    { preHandler: [app.authenticate, app.requireAdmin] },
    async (request, reply) => {
      const parsed = createUserSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

      const { name, email, password, role, householdMode, householdRole } = parsed.data;
      const adminHouseholdId =
        householdMode === "JOIN" ? requireHouseholdId(request, reply) : undefined;
      if (householdMode === "JOIN" && !adminHouseholdId) return;

      const passwordHash = await bcrypt.hash(password, 10);
      try {
        const user = await prisma.$transaction(async (tx) => {
          const created = await tx.user.create({ data: { name, email, passwordHash, role } });

          if (householdMode === "SEPARATE") {
            const household = await tx.household.create({ data: { name } });
            await tx.householdMember.create({
              data: { householdId: household.id, userId: created.id, role: "OWNER" },
            });
          } else {
            await tx.householdMember.create({
              data: { householdId: adminHouseholdId!, userId: created.id, role: householdRole },
            });
          }

          return created;
        });
        invalidateHouseholdCache(user.id);
        return reply
          .code(201)
          .send({ id: user.id, name: user.name, email: user.email, role: user.role });
      } catch (err) {
        if (isUniqueConstraintError(err)) {
          return reply.code(409).send({ error: t("emailAlreadyInUse", request.locale) });
        }
        throw err;
      }
    },
  );

  app.get("/users", { preHandler: [app.authenticate, app.requireAdmin] }, async (request, reply) => {
    const householdId = requireHouseholdId(request, reply);
    if (!householdId) return;

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        memberships: { select: { householdId: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return users.map(({ memberships, ...user }) => ({
      ...user,
      inSharedHousehold: memberships.some((m) => m.householdId === householdId),
    }));
  });

  app.delete(
    "/users/:id",
    { preHandler: [app.authenticate, app.requireAdmin] },
    async (request, reply) => {
      const householdId = requireHouseholdId(request, reply);
      if (!householdId) return;

      const { id } = request.params as { id: string };
      if (id === request.user.sub) {
        return reply.code(400).send({ error: t("cannotDeleteSelf", request.locale) });
      }

      const target = await prisma.user.findUnique({ where: { id }, select: { id: true } });
      if (!target) return reply.code(404).send({ error: t("userNotFound", request.locale) });

      try {
        await prisma.user.delete({ where: { id } });
      } catch (err) {
        if (isRecordNotFoundError(err)) {
          return reply.code(404).send({ error: t("userNotFound", request.locale) });
        }
        throw err;
      }
      return reply.code(204).send();
    },
  );

  // 관리자가 타인의 비밀번호를 "재설정"할 수는 있지만 "알아낼" 수는 없다.
  // 서버가 고른 임시값만 1회 응답하고, 기존 세션은 tokenVersion으로 끊는다.
  app.post(
    "/users/:id/reset-password",
    { preHandler: [app.authenticate, app.requireAdmin] },
    async (request, reply) => {
      const householdId = requireHouseholdId(request, reply);
      if (!householdId) return;

      const { id } = request.params as { id: string };
      if (id === request.user.sub) {
        return reply.code(400).send({ error: t("cannotResetOwnPassword", request.locale) });
      }

      const target = await prisma.user.findUnique({ where: { id } });
      if (!target) return reply.code(404).send({ error: t("userNotFound", request.locale) });

      // 복원 경로와 동일한 엔트로피 — 관리자가 고른 값이 아니므로 사칭·영구공유 여지가 줄어든다.
      const temporaryPassword = randomBytes(12).toString("base64url");
      const passwordHash = await bcrypt.hash(temporaryPassword, 10);
      await prisma.user.update({ where: { id }, data: { passwordHash } });
      await bumpTokenVersion(id);

      return {
        id: target.id,
        email: target.email,
        name: target.name,
        temporaryPassword,
      };
    },
  );

  app.patch("/profile", { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = updateProfileSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const userId = request.user.sub;
    const { name, email, currentPassword, newPassword } = parsed.data;

    const updateData: Record<string, unknown> = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;

    if (newPassword) {
      if (!currentPassword) {
        return reply.code(400).send({ error: t("currentPasswordRequired", request.locale) });
      }
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return reply.code(404).send({ error: t("userNotFound", request.locale) });

      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) return reply.code(400).send({ error: t("incorrectCurrentPassword", request.locale) });

      updateData.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    let user;
    try {
      user = await prisma.user.update({ where: { id: userId }, data: updateData });
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        return reply.code(409).send({ error: t("emailAlreadyInUse", request.locale) });
      }
      throw err;
    }
    if (newPassword) {
      // 비밀번호가 바뀌면 기존 토큰을 전부 무효화한다(탈취 대응). 현재 세션도 재로그인 필요.
      await bumpTokenVersion(userId);
      clearMediaCookie(reply);
    } else {
      invalidateTokenVersionCache(userId);
    }
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  });
}
