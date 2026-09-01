import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { parseEntrySchema } from "@kibble/shared";
import { prisma } from "../lib/prisma.js";
import { t } from "../lib/i18n.js";
import { householdWhere, requireHouseholdWrite } from "../lib/householdScope.js";
import { parseEntryText } from "../lib/parseEntry.js";

export async function parseRoutes(app: FastifyInstance) {
  app.post("/entry", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const parsed = parseEntrySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { petId, text } = parsed.data;

    const pet = await prisma.pet.findFirst({
      where: { id: petId, ...householdWhere(householdId), archivedAt: null },
      select: { id: true },
    });
    if (!pet) return reply.code(404).send({ error: t("petNotFound", request.locale) });

    const noteType = await prisma.eventType.findFirst({
      where: { key: "note", householdId: null, archivedAt: null },
      select: { id: true },
    });
    if (!noteType) {
      return reply.code(503).send({ error: t("systemEventTypesNotSeeded", request.locale) });
    }

    const presets = await prisma.preset.findMany({
      where: {
        ...householdWhere(householdId),
        petId,
        archivedAt: null,
        hiddenAt: null,
      },
      select: {
        id: true,
        label: true,
        sortOrder: true,
        eventType: {
          select: { id: true, key: true, label: true, aliases: true, defaultUnit: true },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    const householdAliases = await prisma.eventType.findMany({
      where: { ...householdWhere(householdId), archivedAt: null },
      select: { key: true, aliases: true },
    });
    const aliasesByKey = new Map(householdAliases.map((row) => [row.key, row.aliases]));

    const targets = presets.map((p) => ({
      eventTypeId: p.eventType.id,
      eventTypeKey: p.eventType.key,
      label: p.label,
      aliases: aliasesByKey.get(p.eventType.key) ?? p.eventType.aliases,
      presetId: p.id,
      defaultUnit: p.eventType.defaultUnit,
      sortOrder: p.sortOrder,
    }));

    const suggestions = parseEntryText(text, targets, noteType.id);

    const labelByTypeId = new Map(
      presets.map((p) => [p.eventType.id, p.label] as const),
    );

    return {
      entryId: randomUUID(),
      rawText: text,
      suggestions: suggestions.map((s) => ({
        lineIndex: s.lineIndex,
        rawLine: s.rawLine,
        eventTypeKey: s.eventTypeKey,
        eventTypeId: s.eventTypeId,
        presetId: s.presetId,
        label: labelByTypeId.get(s.eventTypeId) ?? `eventType.${s.eventTypeKey}`,
        quantity: s.quantity,
        quantityOffered: s.quantityOffered,
        unit: s.unit,
        occurredAt: s.occurredAt?.toISOString() ?? null,
        needsReview: s.needsReview,
        note: s.note,
      })),
    };
  });
}
