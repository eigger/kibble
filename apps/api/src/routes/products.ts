import type { FastifyInstance } from "fastify";
import type { Product, ProductCategory, Palatability, ProductForm, KibbleSize } from "@prisma/client";
import {
  createProductSchema,
  kibbleSizeForForm,
  MAX_PRODUCT_PHOTOS,
  nextPrimaryPhotoPath,
  updateProductSchema,
} from "@kibble/shared";
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
    manufacturedAt: product.manufacturedAt?.toISOString() ?? null,
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
        origin: data.origin ?? null,
        form: (data.form as ProductForm) ?? null,
        // 습식에 "소립"이 붙어 있으면 거짓 정보다 — 건식이 아니면 버린다
        kibbleSize: kibbleSizeForForm(data.form, data.kibbleSize) as KibbleSize | null,
        weightG: data.weightG ?? null,
        dosage: data.dosage ?? null,
        mainIngredients: data.mainIngredients ?? null,
        flavor: data.flavor ?? null,
        ingredientRegistrationNo: data.ingredientRegistrationNo ?? null,
        registeredIngredients: data.registeredIngredients ?? null,
        importer: data.importer ?? null,
        manufacturedAt: data.manufacturedAt ? new Date(data.manufacturedAt) : null,
        storage: data.storage ?? null,
        usage: data.usage ?? null,
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

    const photos = await prisma.productPhoto.findMany({
      where: { productId: product.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, path: true, sortOrder: true },
    });

    return {
      ...serializeProduct(product),
      pet: product.pet,
      photos: photos.map((row) => ({
        id: row.id,
        sortOrder: row.sortOrder,
        isPrimary: row.path === product.photoPath,
      })),
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
    if (data.origin !== undefined) updateData.origin = data.origin;
    if (data.weightG !== undefined) updateData.weightG = data.weightG;
    // form과 kibbleSize는 짝이다. 한쪽만 와도 저장된 다른 쪽과 맞춰 봐야
    // "습식인데 소립"이 남지 않는다.
    if (data.form !== undefined || data.kibbleSize !== undefined) {
      const nextForm = data.form !== undefined ? data.form : existing.form;
      const nextSize = data.kibbleSize !== undefined ? data.kibbleSize : existing.kibbleSize;
      if (data.form !== undefined) updateData.form = data.form;
      updateData.kibbleSize = kibbleSizeForForm(nextForm, nextSize);
    }
    if (data.dosage !== undefined) updateData.dosage = data.dosage;
    if (data.mainIngredients !== undefined) updateData.mainIngredients = data.mainIngredients;
    if (data.flavor !== undefined) updateData.flavor = data.flavor;
    if (data.ingredientRegistrationNo !== undefined) {
      updateData.ingredientRegistrationNo = data.ingredientRegistrationNo;
    }
    if (data.registeredIngredients !== undefined) {
      updateData.registeredIngredients = data.registeredIngredients;
    }
    if (data.importer !== undefined) updateData.importer = data.importer;
    if (data.manufacturedAt !== undefined) {
      updateData.manufacturedAt = data.manufacturedAt ? new Date(data.manufacturedAt) : null;
    }
    if (data.storage !== undefined) updateData.storage = data.storage;
    if (data.usage !== undefined) updateData.usage = data.usage;
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

  /**
   * 사진 목록. 경로는 내보내지 않는다 — 바이트는 아래 :photoId 라우트가 가구 검사를
   * 거쳐 서빙하므로, 클라이언트는 id만 알면 된다.
   */
  app.get("/:id/photos", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdId(request, reply);
    if (!householdId) return;

    const { id } = request.params as { id: string };
    const product = await prisma.product.findFirst({
      where: { id, ...householdWhere(householdId) },
      select: { photoPath: true },
    });
    if (!product) {
      return reply.code(404).send({ error: t("productNotFound", request.locale) });
    }

    const rows = await prisma.productPhoto.findMany({
      where: { productId: id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, path: true, sortOrder: true },
    });

    return rows.map((row) => ({
      id: row.id,
      sortOrder: row.sortOrder,
      isPrimary: row.path === product.photoPath,
    }));
  });

  // POST /api/products/:id/photos — 한 장 추가
  app.post(
    "/:id/photos",
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
        select: { id: true, photoPath: true },
      });
      if (!existing) {
        return reply.code(404).send({ error: t("productNotFound", request.locale) });
      }

      const count = await prisma.productPhoto.count({ where: { productId: id } });
      if (count >= MAX_PRODUCT_PHOTOS) {
        return reply.code(400).send({ error: t("photoLimitReached", request.locale) });
      }

      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ error: t("photoRequired", request.locale) });
      }

      let photoPath: string;
      try {
        const buffer = await file.toBuffer();
        // 추가는 기존 파일을 지우지 않는다 — 대표 교체가 아니라 한 장 더 붙이는 것이다
        photoPath = await saveProductPhoto(id, buffer, null);
      } catch (err) {
        if (err instanceof InvalidProductPhotoError) {
          return reply.code(400).send({ error: t("photoMustBeImage", request.locale) });
        }
        throw err;
      }

      const created = await prisma.productPhoto.create({
        data: { productId: id, path: photoPath, sortOrder: count },
        select: { id: true, sortOrder: true },
      });

      // 첫 장은 자동으로 대표가 된다. 이후에는 사용자가 고른다.
      if (!existing.photoPath) {
        await prisma.product.update({ where: { id }, data: { photoPath } });
      }

      return reply.code(201).send({
        id: created.id,
        sortOrder: created.sortOrder,
        isPrimary: !existing.photoPath,
      });
    },
  );

  /**
   * 대표 사진 바이트. 목록 카드·기록 화면·빠른 제품 칩이 전부 이 경로를 쓴다 —
   * `Product.photoPath` 하나만 알면 되도록 남겨 둔 입구다.
   */
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

  // GET /api/products/:id/photos/:photoId — 바이트
  app.get("/:id/photos/:photoId", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdId(request, reply);
    if (!householdId) return;

    const { id, photoId } = request.params as { id: string; photoId: string };
    const photo = await prisma.productPhoto.findFirst({
      where: { id: photoId, productId: id, product: householdWhere(householdId) },
      select: { path: true },
    });
    if (!photo) {
      return reply.code(404).send({ error: t("photoNotFound", request.locale) });
    }

    try {
      const abs = productPhotoAbsolutePath(photo.path);
      return await sendFileWithRange(request, reply, abs, {
        contentType: "image/webp",
        cacheControl: "private, max-age=3600",
      });
    } catch {
      return reply.code(404).send({ error: t("photoNotFound", request.locale) });
    }
  });

  // POST /api/products/:id/photos/:photoId/primary — 대표로 지정
  app.post(
    "/:id/photos/:photoId/primary",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const householdId = requireHouseholdWrite(request, reply);
      if (!householdId) return;

      const { id, photoId } = request.params as { id: string; photoId: string };
      const photo = await prisma.productPhoto.findFirst({
        where: { id: photoId, productId: id, product: householdWhere(householdId) },
        select: { path: true },
      });
      if (!photo) {
        return reply.code(404).send({ error: t("photoNotFound", request.locale) });
      }

      const updated = await prisma.product.update({
        where: { id },
        data: { photoPath: photo.path },
        include: { pet: { select: { id: true, name: true } } },
      });

      return { ...serializeProduct(updated), pet: updated.pet };
    },
  );

  // DELETE /api/products/:id/photos/:photoId
  app.delete("/:id/photos/:photoId", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const { id, photoId } = request.params as { id: string; photoId: string };
    const photo = await prisma.productPhoto.findFirst({
      where: { id: photoId, productId: id, product: householdWhere(householdId) },
      select: { id: true, path: true },
    });
    if (!photo) {
      return reply.code(404).send({ error: t("photoNotFound", request.locale) });
    }

    await prisma.productPhoto.delete({ where: { id: photo.id } });
    await removeProductPhoto(photo.path);

    // 대표를 지웠으면 남은 것 중 첫 장을 대표로 올린다. 아니면 목록에 빈 칸이 남는다.
    const product = await prisma.product.findFirst({
      where: { id, ...householdWhere(householdId) },
      select: { photoPath: true },
    });
    if (product?.photoPath === photo.path) {
      const remaining = await prisma.productPhoto.findMany({
        where: { productId: id },
        select: { path: true, sortOrder: true },
      });
      await prisma.product.update({
        where: { id },
        data: { photoPath: nextPrimaryPhotoPath(remaining) },
      });
    }

    return reply.code(204).send();
  });

}
