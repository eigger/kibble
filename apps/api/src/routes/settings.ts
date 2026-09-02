import type { FastifyInstance } from "fastify";
import {
  GENERATED_SETTING_KEYS,
  PLAIN_SETTING_KEYS,
  settingKeySchema,
  settingUpdateSchema,
  type SettingEntry,
  type SettingKey,
} from "@kibble/shared";
import { prisma } from "../lib/prisma.js";
import { t } from "../lib/i18n.js";

const SETTING_KEYS = [...settingKeySchema.options] as SettingKey[];

/**
 * VAPID 개인키는 꼬리 4자도 내리지 않는다 — 관리자 화면이라도 스크린샷·지원 채널로
 * 새어 나가는 경로를 만들지 않는다. 설정 여부만 알면 되고, 값은 재발급으로만 바뀐다.
 * (garage는 모든 키에 꼬리를 노출한다 — 여기서 갈라진다)
 */
const FULLY_MASKED_KEYS = new Set<SettingKey>(["VAPID_PRIVATE_KEY"]);

function mask(key: SettingKey, value: string): string {
  if (FULLY_MASKED_KEYS.has(key)) return "••••";
  if (value.length <= 4) return "••••";
  return `••••${value.slice(-4)}`;
}

function isPlain(key: SettingKey): boolean {
  return PLAIN_SETTING_KEYS.includes(key);
}

function isGenerated(key: SettingKey): boolean {
  return GENERATED_SETTING_KEYS.includes(key);
}

export async function settingsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", app.requireAdmin);

  // 연동 관리 화면 목록. 실제 비밀값은 내려주지 않고 마스킹된 형태와
  // 출처(관리 화면에서 저장 vs .env 폴백)만 알려준다.
  app.get("/", async (): Promise<SettingEntry[]> => {
    const rows = await prisma.setting.findMany({ where: { key: { in: SETTING_KEYS } } });
    const byKey = new Map(rows.map((row) => [row.key, row.value]));

    return SETTING_KEYS.map((key) => {
      const readOnly = isGenerated(key);
      const dbValue = byKey.get(key);
      if (dbValue) {
        return {
          key,
          configured: true,
          source: "db",
          masked: mask(key, dbValue),
          value: isPlain(key) ? dbValue : undefined,
          readOnly,
        };
      }

      const envValue = process.env[key];
      if (envValue) {
        return {
          key,
          configured: true,
          source: "env",
          masked: mask(key, envValue),
          value: isPlain(key) ? envValue : undefined,
          readOnly,
        };
      }

      return { key, configured: false, source: "none", masked: null, value: undefined, readOnly };
    });
  });

  app.put("/:key", async (request, reply) => {
    const parsedKey = settingKeySchema.safeParse((request.params as { key: string }).key);
    if (!parsedKey.success) {
      return reply.code(400).send({ error: t("unknownSettingKey", request.locale) });
    }
    if (isGenerated(parsedKey.data)) {
      return reply.code(400).send({ error: t("settingKeyGeneratedOnly", request.locale) });
    }

    const parsed = settingUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const key = parsedKey.data;
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: parsed.data.value },
      update: { value: parsed.data.value },
    });
    return { key, configured: true };
  });

  app.delete("/:key", async (request, reply) => {
    const parsedKey = settingKeySchema.safeParse((request.params as { key: string }).key);
    if (!parsedKey.success) {
      return reply.code(400).send({ error: t("unknownSettingKey", request.locale) });
    }
    if (isGenerated(parsedKey.data)) {
      return reply.code(400).send({ error: t("settingKeyGeneratedOnly", request.locale) });
    }
    await prisma.setting.deleteMany({ where: { key: parsedKey.data } });
    return reply.code(204).send();
  });
}
