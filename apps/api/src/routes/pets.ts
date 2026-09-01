import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import { createPetSchema, updatePetSchema } from "@kibble/shared";
import { prisma } from "../lib/prisma.js";
import { t } from "../lib/i18n.js";
import { householdWhere, requireHouseholdId, requireHouseholdWrite } from "../lib/householdScope.js";
import {
  ensurePresetsForPetInTx,
  SystemEventTypesNotSeededError,
} from "../lib/seed/ensurePresetsForPet.js";
import { petPhotoAbsolutePath, removePetPhoto, savePetPhoto } from "../lib/petPhoto.js";

const petSummarySelect = {
  id: true,
  name: true,
  species: true,
  sortOrder: true,
  photoPath: true,
} as const;

const petDetailSelect = {
  ...petSummarySelect,
  breed: true,
  sex: true,
  neutered: true,
  birthDate: true,
  adoptionDate: true,
  registrationNo: true,
  microchipNo: true,
  color: true,
} as const;

type PetRow = {
  id: string;
  name: string;
  species: "DOG" | "CAT" | "OTHER";
  sortOrder: number;
  photoPath: string | null;
  breed: string | null;
  sex: "MALE" | "FEMALE" | "UNKNOWN" | null;
  neutered: boolean;
  birthDate: Date | null;
  adoptionDate: Date | null;
  registrationNo: string | null;
  microchipNo: string | null;
  color: string | null;
};

function serializePet(row: PetRow) {
  return {
    id: row.id,
    name: row.name,
    species: row.species,
    sortOrder: row.sortOrder,
    photoPath: row.photoPath,
    breed: row.breed,
    sex: row.sex,
    neutered: row.neutered,
    birthDate: row.birthDate?.toISOString() ?? null,
    adoptionDate: row.adoptionDate?.toISOString() ?? null,
    registrationNo: row.registrationNo,
    microchipNo: row.microchipNo,
    color: row.color,
  };
}

function parseOptionalDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

async function findActivePet(householdId: string, id: string) {
  return prisma.pet.findFirst({
    where: { id, ...householdWhere(householdId), archivedAt: null },
    select: petDetailSelect,
  });
}

export async function petRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdId(request, reply);
    if (!householdId) return;

    const pets = await prisma.pet.findMany({
      where: { ...householdWhere(householdId), archivedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: petSummarySelect,
    });
    return pets;
  });

  app.get("/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdId(request, reply);
    if (!householdId) return;

    const { id } = request.params as { id: string };
    const pet = await findActivePet(householdId, id);
    if (!pet) return reply.code(404).send({ error: t("petNotFound", request.locale) });
    return serializePet(pet);
  });

  app.post("/", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const parsed = createPetSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { name, species } = parsed.data;
    try {
      const pet = await prisma.$transaction(async (tx) => {
        const maxSort = await tx.pet.aggregate({
          where: { ...householdWhere(householdId), archivedAt: null },
          _max: { sortOrder: true },
        });
        const created = await tx.pet.create({
          data: {
            householdId,
            name,
            species,
            sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
          },
          select: petDetailSelect,
        });
        await ensurePresetsForPetInTx(tx, householdId, created.id, species);
        return created;
      });
      return reply.code(201).send(serializePet(pet));
    } catch (err) {
      if (err instanceof SystemEventTypesNotSeededError) {
        return reply.code(503).send({ error: t("systemEventTypesNotSeeded", request.locale) });
      }
      throw err;
    }
  });

  app.patch("/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const { id } = request.params as { id: string };
    const existing = await findActivePet(householdId, id);
    if (!existing) return reply.code(404).send({ error: t("petNotFound", request.locale) });

    const parsed = updatePetSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const data = parsed.data;
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.species !== undefined) updateData.species = data.species;
    if (data.breed !== undefined) updateData.breed = data.breed;
    if (data.sex !== undefined) updateData.sex = data.sex;
    if (data.neutered !== undefined) updateData.neutered = data.neutered;
    if (data.color !== undefined) updateData.color = data.color;
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
    if (data.microchipNo !== undefined) updateData.microchipNo = data.microchipNo || null;
    if (data.registrationNo !== undefined) {
      updateData.registrationNo =
        data.registrationNo === "" || data.registrationNo == null ? null : data.registrationNo;
    }
    const birthDate = parseOptionalDate(data.birthDate);
    if (birthDate !== undefined) updateData.birthDate = birthDate;
    const adoptionDate = parseOptionalDate(data.adoptionDate);
    if (adoptionDate !== undefined) updateData.adoptionDate = adoptionDate;

    const pet = await prisma.pet.update({
      where: { id },
      data: updateData,
      select: petDetailSelect,
    });
    return serializePet(pet);
  });

  app.delete("/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const { id } = request.params as { id: string };
    const existing = await findActivePet(householdId, id);
    if (!existing) return reply.code(404).send({ error: t("petNotFound", request.locale) });

    const activeCount = await prisma.pet.count({
      where: { ...householdWhere(householdId), archivedAt: null },
    });
    if (activeCount <= 1) {
      return reply.code(400).send({ error: t("cannotArchiveLastPet", request.locale) });
    }

    await prisma.pet.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
    return reply.code(204).send();
  });

  app.post("/:id/photo", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const { id } = request.params as { id: string };
    const existing = await findActivePet(householdId, id);
    if (!existing) return reply.code(404).send({ error: t("petNotFound", request.locale) });

    const file = await request.file();
    if (!file) return reply.code(400).send({ error: t("photoRequired", request.locale) });
    if (!file.mimetype.startsWith("image/")) {
      return reply.code(400).send({ error: t("photoMustBeImage", request.locale) });
    }

    const buffer = await file.toBuffer();
    const photoPath = await savePetPhoto(id, buffer, existing.photoPath);
    const pet = await prisma.pet.update({
      where: { id },
      data: { photoPath },
      select: petDetailSelect,
    });
    return serializePet(pet);
  });

  app.get("/:id/photo", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdId(request, reply);
    if (!householdId) return;

    const { id } = request.params as { id: string };
    const pet = await findActivePet(householdId, id);
    if (!pet?.photoPath) return reply.code(404).send({ error: t("photoNotFound", request.locale) });

    try {
      const abs = petPhotoAbsolutePath(pet.photoPath);
      const stream = createReadStream(abs);
      reply.type("image/webp");
      return reply.send(stream);
    } catch {
      return reply.code(404).send({ error: t("photoNotFound", request.locale) });
    }
  });

  app.delete("/:id/photo", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const { id } = request.params as { id: string };
    const existing = await findActivePet(householdId, id);
    if (!existing) return reply.code(404).send({ error: t("petNotFound", request.locale) });

    await removePetPhoto(existing.photoPath);
    const pet = await prisma.pet.update({
      where: { id },
      data: { photoPath: null },
      select: petDetailSelect,
    });
    return serializePet(pet);
  });
}

export async function onboardingRoutes(app: FastifyInstance) {
  app.get("/status", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdId(request, reply);
    if (!householdId) return;

    const petCount = await prisma.pet.count({
      where: { ...householdWhere(householdId), archivedAt: null },
    });

    return { householdId, needsPet: petCount === 0, petCount };
  });
}
