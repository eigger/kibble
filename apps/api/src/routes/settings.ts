import type { FastifyInstance } from "fastify";
import { settingUpdateSchema } from "@kibble/shared";
import { prisma } from "../lib/prisma.js";
import { t } from "../lib/i18n.js";

const DEFAULT_APP_PUBLIC_URL = "http://localhost:3000";

const MANAGED_KEYS = ["APP_PUBLIC_URL", "KAKAO_MAP_APP_KEY"];

export async function settingsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", app.requireAdmin);

  app.get("/", async () => {
    const rows = await prisma.setting.findMany({ where: { key: { in: MANAGED_KEYS } } });
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return MANAGED_KEYS.map((key) => {
      if (key === "APP_PUBLIC_URL") {
        return {
          key,
          hasValue: byKey.has(key),
          effectiveValue: byKey.get(key)?.value || process.env.APP_PUBLIC_URL || DEFAULT_APP_PUBLIC_URL,
        };
      }
      return { key, hasValue: byKey.has(key) };
    });
  });

  app.put("/:key", async (request, reply) => {
    const { key } = request.params as { key: string };
    if (!MANAGED_KEYS.includes(key)) return reply.code(400).send({ error: t("unknownSettingKey", request.locale) });

    const parsed = settingUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    await prisma.setting.upsert({
      where: { key },
      create: { key, value: parsed.data.value },
      update: { value: parsed.data.value },
    });
    return { key, hasValue: true };
  });

  app.delete("/:key", async (request, reply) => {
    const { key } = request.params as { key: string };
    if (!MANAGED_KEYS.includes(key)) return reply.code(400).send({ error: t("unknownSettingKey", request.locale) });
    await prisma.setting.deleteMany({ where: { key } });
    return reply.code(204).send();
  });
}
