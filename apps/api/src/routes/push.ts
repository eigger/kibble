import type { FastifyInstance } from "fastify";
import {
  medicationReminderPrefsSchema,
  medicationReminderSettingKey,
  parseMedicationReminderPrefs,
  pushSubscribeSchema,
  pushUnsubscribeSchema,
} from "@kibble/shared";
import { prisma } from "../lib/prisma.js";
import { t } from "../lib/i18n.js";
import {
  requireHouseholdId,
  requireHouseholdWrite,
} from "../lib/householdScope.js";
import { sessionUserId } from "../lib/authenticate.js";
import { generateAndStoreVapidKeys, getVapidKeys } from "../lib/vapid.js";
import { sendPushToUser } from "../lib/push.js";

export async function pushRoutes(app: FastifyInstance) {
  app.get("/vapid-public-key", { preHandler: [app.authenticate] }, async (_request, reply) => {
    const keys = await getVapidKeys();
    if (!keys) {
      return reply.code(503).send({ error: t("pushNotConfigured", _request.locale) });
    }
    return { publicKey: keys.publicKey, configured: true };
  });

  app.get("/status", { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = sessionUserId(request);
    if (!userId) return reply.code(401).send({ error: "unauthorized" });

    const keys = await getVapidKeys();
    const subscriptionCount = await prisma.pushSubscription.count({ where: { userId } });
    return {
      configured: keys != null,
      subscriptionCount,
    };
  });

  app.post("/subscribe", { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = sessionUserId(request);
    if (!userId) return reply.code(401).send({ error: "unauthorized" });

    const keys = await getVapidKeys();
    if (!keys) {
      return reply.code(503).send({ error: t("pushNotConfigured", request.locale) });
    }

    const parsed = pushSubscribeSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const body = parsed.data;
    await prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: {
        userId,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        locale: body.locale ?? request.locale,
      },
      update: {
        userId,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        locale: body.locale ?? request.locale,
      },
    });

    return { ok: true };
  });

  app.delete("/subscribe", { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = sessionUserId(request);
    if (!userId) return reply.code(401).send({ error: "unauthorized" });

    const parsed = pushUnsubscribeSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const existing = await prisma.pushSubscription.findUnique({
      where: { endpoint: parsed.data.endpoint },
      select: { userId: true },
    });
    if (!existing) return { ok: true };
    if (existing.userId !== userId) {
      return reply.code(403).send({ error: t("forbiddenSubscription", request.locale) });
    }

    await prisma.pushSubscription.delete({ where: { endpoint: parsed.data.endpoint } });
    return { ok: true };
  });

  app.get("/medication-reminder", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdId(request, reply);
    if (!householdId) return;

    const row = await prisma.setting.findUnique({
      where: { key: medicationReminderSettingKey(householdId) },
      select: { value: true },
    });
    return parseMedicationReminderPrefs(row?.value);
  });

  app.patch("/medication-reminder", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const parsed = medicationReminderPrefsSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    await prisma.setting.upsert({
      where: { key: medicationReminderSettingKey(householdId) },
      create: { key: medicationReminderSettingKey(householdId), value: JSON.stringify(parsed.data) },
      update: { value: JSON.stringify(parsed.data) },
    });

    return parsed.data;
  });

  app.post("/test", { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = sessionUserId(request);
    if (!userId) return reply.code(401).send({ error: "unauthorized" });

    const sent = await sendPushToUser(userId, {
      title: t("pushTestTitle", request.locale),
      body: t("pushTestBody", request.locale),
      url: "/care",
    });
    if (sent === 0) {
      return reply.code(400).send({ error: t("noPushSubscriptions", request.locale) });
    }
    return { ok: true, sent };
  });

  app.post("/vapid/generate", { preHandler: [app.authenticate, app.requireAdmin] }, async () => {
    return generateAndStoreVapidKeys();
  });
}
