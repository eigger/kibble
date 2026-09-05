import type { FastifyInstance } from "fastify";
import type { Product, ProductCategory, Palatability } from "@prisma/client";
import { createProductSchema, updateProductSchema } from "@kibble/shared";
import { prisma } from "../lib/prisma.js";
import { t } from "../lib/i18n.js";
import { householdWhere, requireHouseholdId, requireHouseholdWrite } from "../lib/householdScope.js";
import { assertPetInHousehold } from "../lib/historyPeriods.js";
import {
  InvalidProductPhotoError,
  productPhotoAbsolutePath,
  removeProductPhoto,
  saveProductPhoto,
} from "../lib/productPhoto.js";
import { sendFileWithRange } from "../lib/sendFile.js";

function serializeProduct(product: Product) {
  return {
    ...product,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    expiryDate: product.expiryDate?.toISOString() ?? null,
    openedAt: product.openedAt?.toISOString() ?? null,
    purchaseDate: product.purchaseDate?.toISOString() ?? null,
    archivedAt: product.archivedAt?.toISOString() ?? null,
  };
}

export async function productRoutes(app: FastifyInstance) {
  // GET /api/products
  app.get("/", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdId(request, reply);
    if (!householdId) return;

    const query = request.query as {
      category?: string;
      petId?: string;
      isActive?: string;
      archived?: string;
    };

    const where: Record<string, unknown> = {
      ...householdWhere(householdId),
    };

    if (query.archived === "true" || query.archived === "1") {
      where.archivedAt = { not: null };
    } else if (query.archived !== "all") {
      where.archivedAt = null;
    }

    if (query.category) {
      where.category = query.category as ProductCategory;
    }

    if (query.petId) {
      const petId = query.petId.trim();
      where.OR = [{ petId: null }, { petId }];
    }

    if (query.isActive === "true" || query.isActive === "1") {
      where.isActive = true;
    } else if (query.isActive === "false" || query.isActive === "0") {
      where.isActive = false;
    }

    const rows = await prisma.product.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }, { name: "asc" }],
      include: {
        pet: { select: { id: true, name: true } },
      },
    });

    return rows.map((r) => ({
      ...serializeProduct(r),
      pet: r.pet,
    }));
  });

  // POST /api/products
  app.post("/", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const parsed = createProductSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const data = parsed.data;
    if (data.petId) {
      const petOk = await assertPetInHousehold(prisma, householdId, data.petId);
      if (!petOk) {
        return reply.code(404).send({ error: t("petNotFound", request.locale) });
      }
    }

    const created = await prisma.product.create({
      data: {
        householdId,
        name: data.name,
        brand: data.brand ?? null,
        category: data.category as ProductCategory,
        petId: data.petId ?? null,
        purchaseUrl: data.purchaseUrl ?? null,
        dosage: data.dosage ?? null,
        ingredients: data.ingredients ?? null,
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
        openedAt: data.openedAt ? new Date(data.openedAt) : null,
        purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null,
        costKrw: data.costKrw ?? null,
        isActive: data.isActive ?? true,
        palatability: (data.palatability as Palatability) ?? null,
        adverseReactions: data.adverseReactions ?? [],
        notes: data.notes ?? null,
      },
      include: {
        pet: { select: { id: true, name: true } },
      },
    });

    return reply.code(201).send({
      ...serializeProduct(created),
      pet: created.pet,
    });
  });

  // GET /api/products/:id
  app.get("/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdId(request, reply);
    if (!householdId) return;

    const { id } = request.params as { id: string };
    const product = await prisma.product.findFirst({
      where: { id, ...householdWhere(householdId) },
      include: {
        pet: { select: { id: true, name: true } },
      },
    });

    if (!product) {
      return reply.code(404).send({ error: t("productNotFound", request.locale) });
    }

    // Recent events linking to this product (last 5)
    const recentEvents = await prisma.event.findMany({
      where: {
        productId: product.id,
        ...householdWhere(householdId),
        deletedAt: null,
      },
      orderBy: { occurredAt: "desc" },
      take: 5,
      select: {
        id: true,
        occurredAt: true,
        quantity: true,
        unit: true,
        costKrw: true,
        note: true,
      },
    });

    return {
      ...serializeProduct(product),
      pet: product.pet,
      recentEvents: recentEvents.map((e) => ({
        ...e,
        occurredAt: e.occurredAt.toISOString(),
        quantity: e.quantity != null ? Number(e.quantity) : null,
      })),
    };
  });

  // PATCH /api/products/:id
  app.patch("/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const { id } = request.params as { id: string };
    const parsed = updateProductSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const existing = await prisma.product.findFirst({
      where: { id, ...householdWhere(householdId) },
    });
    if (!existing) {
      return reply.code(404).send({ error: t("productNotFound", request.locale) });
    }

    const data = parsed.data;
    if (data.petId) {
      const petOk = await assertPetInHousehold(prisma, householdId, data.petId);
      if (!petOk) {
        return reply.code(404).send({ error: t("petNotFound", request.locale) });
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.brand !== undefined) updateData.brand = data.brand;
    if (data.category !== undefined) updateData.category = data.category as ProductCategory;
    if (data.petId !== undefined) updateData.petId = data.petId;
    if (data.purchaseUrl !== undefined) updateData.purchaseUrl = data.purchaseUrl;
    if (data.dosage !== undefined) updateData.dosage = data.dosage;
    if (data.ingredients !== undefined) updateData.ingredients = data.ingredients;
    if (data.expiryDate !== undefined) {
      updateData.expiryDate = data.expiryDate ? new Date(data.expiryDate) : null;
    }
    if (data.openedAt !== undefined) {
      updateData.openedAt = data.openedAt ? new Date(data.openedAt) : null;
    }
    if (data.purchaseDate !== undefined) {
      updateData.purchaseDate = data.purchaseDate ? new Date(data.purchaseDate) : null;
    }
    if (data.costKrw !== undefined) updateData.costKrw = data.costKrw;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.palatability !== undefined) {
      updateData.palatability = data.palatability as Palatability;
    }
    if (data.adverseReactions !== undefined) updateData.adverseReactions = data.adverseReactions;
    if (data.notes !== undefined) updateData.notes = data.notes;

    const updated = await prisma.product.update({
      where: { id },
      data: updateData,
      include: {
        pet: { select: { id: true, name: true } },
      },
    });

    return {
      ...serializeProduct(updated),
      pet: updated.pet,
    };
  });

  // DELETE /api/products/:id (Archive)
  app.delete("/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const { id } = request.params as { id: string };
    const existing = await prisma.product.findFirst({
      where: { id, ...householdWhere(householdId) },
    });
    if (!existing) {
      return reply.code(404).send({ error: t("productNotFound", request.locale) });
    }

    await prisma.product.update({
      where: { id },
      data: { archivedAt: new Date(), isActive: false },
    });

    return reply.code(204).send();
  });

  // POST /api/products/:id/restore
  app.post("/:id/restore", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const { id } = request.params as { id: string };
    const existing = await prisma.product.findFirst({
      where: { id, ...householdWhere(householdId), archivedAt: { not: null } },
      include: { pet: { select: { id: true, name: true } } },
    });
    if (!existing) {
      return reply.code(404).send({ error: t("productNotFound", request.locale) });
    }

    const restored = await prisma.product.update({
      where: { id },
      data: { archivedAt: null, isActive: true },
      include: { pet: { select: { id: true, name: true } } },
    });

    return {
      ...serializeProduct(restored),
      pet: restored.pet,
    };
  });

  // POST /api/products/:id/photo
  app.post(
    "/:id/photo",
    {
      preHandler: [app.authenticate],
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const householdId = requireHouseholdWrite(request, reply);
      if (!householdId) return;

      const { id } = request.params as { id: string };
      const existing = await prisma.product.findFirst({
        where: { id, ...householdWhere(householdId) },
      });
      if (!existing) {
        return reply.code(404).send({ error: t("productNotFound", request.locale) });
      }

      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ error: t("photoRequired", request.locale) });
      }

      let photoPath: string;
      try {
        const buffer = await file.toBuffer();
        photoPath = await saveProductPhoto(id, buffer, existing.photoPath);
      } catch (err) {
        if (err instanceof InvalidProductPhotoError) {
          return reply.code(400).send({ error: t("photoMustBeImage", request.locale) });
        }
        throw err;
      }

      const updated = await prisma.product.update({
        where: { id },
        data: { photoPath },
        include: { pet: { select: { id: true, name: true } } },
      });

      return {
        ...serializeProduct(updated),
        pet: updated.pet,
      };
    },
  );

  // GET /api/products/:id/photo
  app.get("/:id/photo", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdId(request, reply);
    if (!householdId) return;

    const { id } = request.params as { id: string };
    const product = await prisma.product.findFirst({
      where: { id, ...householdWhere(householdId) },
      select: { photoPath: true },
    });

    if (!product?.photoPath) {
      return reply.code(404).send({ error: t("photoNotFound", request.locale) });
    }

    try {
      const abs = productPhotoAbsolutePath(product.photoPath);
      return await sendFileWithRange(request, reply, abs, {
        contentType: "image/webp",
        cacheControl: "private, max-age=3600",
      });
    } catch {
      return reply.code(404).send({ error: t("photoNotFound", request.locale) });
    }
  });

  // DELETE /api/products/:id/photo
  app.delete("/:id/photo", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const { id } = request.params as { id: string };
    const existing = await prisma.product.findFirst({
      where: { id, ...householdWhere(householdId) },
    });
    if (!existing) {
      return reply.code(404).send({ error: t("productNotFound", request.locale) });
    }

    await removeProductPhoto(existing.photoPath);
    const updated = await prisma.product.update({
      where: { id },
      data: { photoPath: null },
      include: { pet: { select: { id: true, name: true } } },
    });

    return {
      ...serializeProduct(updated),
      pet: updated.pet,
    };
  });
}
