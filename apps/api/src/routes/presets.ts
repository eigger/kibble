import type { FastifyInstance } from "fastify";
import {
  createPresetSchema,
  updateEventTypeAliasesSchema,
  updatePresetSchema,
} from "@kibble/shared";
import { prisma } from "../lib/prisma.js";
import { t } from "../lib/i18n.js";
import { householdWhere, requireHouseholdId, requireHouseholdWrite } from "../lib/householdScope.js";

function parsePetIdQuery(raw: unknown): { petId?: string; invalid: boolean } {
  if (raw === undefined) return { invalid: false };
  if (typeof raw !== "string") return { invalid: true };
  const petId = raw.trim();
  if (!petId) return { invalid: true };
  return { petId, invalid: false };
}

function parseIncludeHidden(raw: unknown): boolean {
  return raw === "1" || raw === "true";
}

const presetSelect = {
  id: true,
  petId: true,
  eventTypeId: true,
  label: true,
  quantity: true,
  unit: true,
  note: true,
  isStarter: true,
  sortOrder: true,
  hiddenAt: true,
  eventType: { select: { key: true, label: true } },
} as const;

type PresetRow = {
  id: string;
  petId: string | null;
  eventTypeId: string;
  label: string;
  quantity: { toNumber(): number } | null;
  unit: string | null;
  note: string | null;
  isStarter: boolean;
  sortOrder: number;
  hiddenAt: Date | null;
  eventType: { key: string; label: string };
};

function serializePreset(row: PresetRow) {
  return {
    id: row.id,
    petId: row.petId,
    eventTypeId: row.eventTypeId,
    label: row.label,
    quantity: row.quantity != null ? row.quantity.toNumber() : null,
    unit: row.unit,
    note: row.note,
    isStarter: row.isStarter,
    sortOrder: row.sortOrder,
    hiddenAt: row.hiddenAt?.toISOString() ?? null,
    eventType: row.eventType,
  };
}

async function findActivePreset(householdId: string, id: string) {
  return prisma.preset.findFirst({
    where: { id, ...householdWhere(householdId), archivedAt: null },
    select: presetSelect,
  });
}

export async function presetRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdId(request, reply);
    if (!householdId) return;

    const query = request.query as { petId?: unknown; includeHidden?: unknown };
    const { petId, invalid } = parsePetIdQuery(query.petId);
    if (invalid) return reply.code(400).send({ error: "invalid petId" });

    const includeHidden = parseIncludeHidden(query.includeHidden);

    const presets = await prisma.preset.findMany({
      where: {
        ...householdWhere(householdId),
        archivedAt: null,
        ...(includeHidden ? {} : { hiddenAt: null }),
        ...(petId ? { petId } : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      select: presetSelect,
    });
    return presets.map(serializePreset);
  });

  app.get("/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdId(request, reply);
    if (!householdId) return;

    const { id } = request.params as { id: string };
    const preset = await findActivePreset(householdId, id);
    if (!preset) return reply.code(404).send({ error: t("presetNotFound", request.locale) });
    return serializePreset(preset);
  });

  app.post("/", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const parsed = createPresetSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { petId, eventTypeId, label, quantity, unit, note, sortOrder } = parsed.data;

    const pet = await prisma.pet.findFirst({
      where: { id: petId, ...householdWhere(householdId), archivedAt: null },
      select: { id: true },
    });
    if (!pet) return reply.code(404).send({ error: t("petNotFound", request.locale) });

    const eventType = await prisma.eventType.findFirst({
      where: {
        id: eventTypeId,
        archivedAt: null,
        OR: [{ householdId: null }, { householdId }],
      },
      select: { id: true },
    });
    if (!eventType) return reply.code(404).send({ error: t("eventTypeNotFound", request.locale) });

    const duplicate = await prisma.preset.findFirst({
      where: { householdId, petId, eventTypeId, archivedAt: null },
      select: { id: true },
    });
    if (duplicate) return reply.code(409).send({ error: t("presetDuplicate", request.locale) });

    const maxSort = await prisma.preset.aggregate({
      where: { ...householdWhere(householdId), petId, archivedAt: null },
      _max: { sortOrder: true },
    });

    const created = await prisma.preset.create({
      data: {
        householdId,
        petId,
        eventTypeId,
        label,
        quantity: quantity ?? null,
        unit: unit ?? null,
        note: note ?? null,
        sortOrder: sortOrder ?? (maxSort._max.sortOrder ?? 0) + 1,
        isStarter: false,
      },
      select: presetSelect,
    });
    return reply.code(201).send(serializePreset(created));
  });

  app.patch("/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const { id } = request.params as { id: string };
    const parsed = updatePresetSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const data = parsed.data;
    const updateData: Record<string, unknown> = {};
    if (data.label !== undefined) updateData.label = data.label;
    if (data.quantity !== undefined) updateData.quantity = data.quantity;
    if (data.unit !== undefined) updateData.unit = data.unit;
    if (data.note !== undefined) updateData.note = data.note;
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
    if (data.hidden !== undefined) {
      updateData.hiddenAt = data.hidden ? new Date() : null;
    }

    const updated = await prisma.preset.updateMany({
      where: { id, ...householdWhere(householdId), archivedAt: null },
      data: updateData,
    });
    if (updated.count === 0) {
      return reply.code(404).send({ error: t("presetNotFound", request.locale) });
    }

    const preset = await findActivePreset(householdId, id);
    return serializePreset(preset!);
  });

  app.delete("/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const { id } = request.params as { id: string };
    const archived = await prisma.preset.updateMany({
      where: { id, ...householdWhere(householdId), archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (archived.count === 0) {
      return reply.code(404).send({ error: t("presetNotFound", request.locale) });
    }
    return reply.code(204).send();
  });
}

export async function eventTypeRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdId(request, reply);
    if (!householdId) return;

    const [systemTypes, householdTypes] = await Promise.all([
      prisma.eventType.findMany({
        where: { householdId: null, archivedAt: null },
        orderBy: { sortOrder: "asc" },
        select: { id: true, key: true, label: true, aliases: true, defaultUnit: true, species: true },
      }),
      prisma.eventType.findMany({
        where: { ...householdWhere(householdId), archivedAt: null },
        select: { id: true, key: true, label: true, aliases: true, defaultUnit: true, species: true },
      }),
    ]);

    const overrideByKey = new Map(householdTypes.map((row) => [row.key, row]));
    return systemTypes.map((sys) => {
      const override = overrideByKey.get(sys.key);
      return {
        key: sys.key,
        label: sys.label,
        defaultUnit: sys.defaultUnit,
        species: sys.species,
        systemAliases: sys.aliases,
        aliases: override?.aliases ?? sys.aliases,
        hasHouseholdOverride: Boolean(override),
        householdEventTypeId: override?.id ?? null,
      };
    });
  });

  app.patch("/:key/aliases", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const { key } = request.params as { key: string };
    const parsed = updateEventTypeAliasesSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const system = await prisma.eventType.findFirst({
      where: { key, householdId: null, archivedAt: null },
    });
    if (!system) return reply.code(404).send({ error: t("eventTypeNotFound", request.locale) });

    const existing = await prisma.eventType.findFirst({
      where: { key, ...householdWhere(householdId), archivedAt: null },
    });

    if (existing) {
      const updated = await prisma.eventType.updateMany({
        where: { id: existing.id, ...householdWhere(householdId) },
        data: { aliases: parsed.data.aliases },
      });
      if (updated.count === 0) {
        return reply.code(404).send({ error: t("eventTypeNotFound", request.locale) });
      }
      const row = await prisma.eventType.findFirst({
        where: { id: existing.id, ...householdWhere(householdId) },
        select: { key: true, aliases: true },
      });
      return { key: row!.key, aliases: row!.aliases };
    }

    const created = await prisma.eventType.create({
      data: {
        householdId,
        key: system.key,
        label: system.label,
        icon: system.icon,
        color: system.color,
        category: system.category,
        defaultUnit: system.defaultUnit,
        species: system.species,
        scaleType: system.scaleType,
        sortOrder: system.sortOrder,
        aliases: parsed.data.aliases,
      },
      select: { key: true, aliases: true },
    });
    return created;
  });
}
