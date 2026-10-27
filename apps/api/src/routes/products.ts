import type { FastifyInstance } from "fastify";
import type { Prisma, ProductCategory, Palatability, ProductForm, KibbleSize } from "@prisma/client";
import {
  createProductSchema,
  kibbleSizeForForm,
  kstDayKey,
  MAX_PRODUCT_PHOTOS,
  nextPrimaryPhotoPath,
  productCategorySchema,
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
import { serializeProduct } from "../lib/serializeProduct.js";
import { syncProductSnapshot } from "../services/productPurchase.js";

/** 구매 이력이 소유하는 Product 컬럼 5개 (WORKPLAN §7.13) */
const PURCHASE_OWNED_FIELDS = [
  "purchaseDate",
  "costKrw",
  "manufacturedAt",
  "expiryDate",
  "openedAt",
] as const;

const dayKey = (v: Date | string | null | undefined) => (v ? kstDayKey(new Date(v)) : null);
const toDate = (v: string | null | undefined) => (v ? new Date(v) : null);

const withPurchaseCount = { _count: { select: { purchases: true } } } as const;

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

    // K-12: 알 수 없는 카테고리는 거부하지 않고 필터를 건너뛴다 (Prisma 검증 오류 500 방지)
    const category = productCategorySchema.safeParse(query.category);
    if (category.success) where.category = category.data;

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
        ...withPurchaseCount,
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
        // 구매·기한 값을 넣어 만들었다면 그것이 첫 구매다. 행이 없으면 "다시 구매"를 눌렀을 때
        // 스냅샷이 다시 계산되며 첫 구매 값이 사라진다 (WORKPLAN §7.13)
        ...(PURCHASE_OWNED_FIELDS.some((k) => data[k] != null)
          ? {
              purchases: {
                create: {
                  householdId,
                  purchasedAt: toDate(data.purchaseDate),
                  costKrw: data.costKrw ?? null,
                  weightG: data.weightG ?? null,
                  purchaseUrl: data.purchaseUrl ?? null,
                  manufacturedAt: toDate(data.manufacturedAt),
                  expiryDate: toDate(data.expiryDate),
                  openedAt: toDate(data.openedAt),
                },
              },
            }
          : {}),
      },
      include: {
        pet: { select: { id: true, name: true } },
        ...withPurchaseCount,
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
        ...withPurchaseCount,
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

    const data = { ...parsed.data };
    if (data.petId) {
      const petOk = await assertPetInHousehold(prisma, householdId, data.petId);
      if (!petOk) {
        return reply.code(404).send({ error: t("petNotFound", request.locale) });
      }
    }

    // 구매·기한 5칸은 구매 이력이 소유한다 (WORKPLAN §7.13). 건수 판단과 쓰기는 한 트랜잭션에서
    // 하고(아래 writeProduct), 쓴 뒤에는 행 기준으로 스냅샷을 다시 맞춘다.
    const touchesPurchase = PURCHASE_OWNED_FIELDS.some((k) => data[k] !== undefined);

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
    if (data.storage !== undefined) updateData.storage = data.storage;
    if (data.usage !== undefined) updateData.usage = data.usage;
    if (data.ingredients !== undefined) updateData.ingredients = data.ingredients;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.palatability !== undefined) {
      updateData.palatability = data.palatability as Palatability;
    }
    if (data.adverseReactions !== undefined) updateData.adverseReactions = data.adverseReactions;
    if (data.notes !== undefined) updateData.notes = data.notes;

    const writeProduct = async (db: Pick<Prisma.TransactionClient, "product" | "productPurchase">) => {
      const productData: Record<string, unknown> = { ...updateData };
      let rows: { id: string }[] = [];
      // 0~1건이면 단방향 미러: 기존 값과 비교해 바뀐 필드만 유일한 구매 행에 옮긴다.
      // 시트는 항상 전체 필드를 보내므로 이름만 고친 저장이 행을 건드리면 안 된다.
      // 2건 이상이면 5칸은 무시한다 — 거부하지 않는다 (K-12).
      const purchaseChanges: Partial<
        Pick<
          Prisma.ProductPurchaseUncheckedCreateInput,
          "purchasedAt" | "costKrw" | "manufacturedAt" | "expiryDate" | "openedAt"
        >
      > = {};
      if (touchesPurchase) {
        rows = await db.productPurchase.findMany({
          where: { productId: id, ...householdWhere(householdId) },
          select: { id: true },
        });
        if (rows.length < 2) {
          if (data.purchaseDate !== undefined) {
            productData.purchaseDate = toDate(data.purchaseDate);
            if (dayKey(data.purchaseDate) !== dayKey(existing.purchaseDate)) {
              purchaseChanges.purchasedAt = toDate(data.purchaseDate);
            }
          }
          if (data.costKrw !== undefined) {
            productData.costKrw = data.costKrw ?? null;
            if ((data.costKrw ?? null) !== existing.costKrw) purchaseChanges.costKrw = data.costKrw ?? null;
          }
          if (data.manufacturedAt !== undefined) {
            productData.manufacturedAt = toDate(data.manufacturedAt);
            if (dayKey(data.manufacturedAt) !== dayKey(existing.manufacturedAt)) {
              purchaseChanges.manufacturedAt = toDate(data.manufacturedAt);
            }
          }
          if (data.expiryDate !== undefined) {
            productData.expiryDate = toDate(data.expiryDate);
            if (dayKey(data.expiryDate) !== dayKey(existing.expiryDate)) {
              purchaseChanges.expiryDate = toDate(data.expiryDate);
            }
          }
          if (data.openedAt !== undefined) {
            productData.openedAt = toDate(data.openedAt);
            if (dayKey(data.openedAt) !== dayKey(existing.openedAt)) {
              purchaseChanges.openedAt = toDate(data.openedAt);
            }
          }
        }
      }

      const { count: written } = await db.product.updateMany({
        where: { id, ...householdWhere(householdId) },
        data: productData,
      });
      if (written === 0 || !touchesPurchase) return written;

      if (Object.keys(purchaseChanges).length > 0) {
        if (rows.length === 1) {
          await db.productPurchase.updateMany({
            where: { id: rows[0].id, productId: id, ...householdWhere(householdId) },
            data: purchaseChanges,
          });
        } else if (Object.values(purchaseChanges).some((v) => v != null)) {
          // 구매가 없던 제품이 처음 값을 얻었다 — 그것이 첫 구매다. 구매일을 안 적었으면 모름(null)
          await db.productPurchase.create({
            data: {
              householdId,
              productId: id,
              purchasedAt: null,
              costKrw: data.costKrw !== undefined ? (data.costKrw ?? null) : existing.costKrw,
              manufacturedAt:
                data.manufacturedAt !== undefined ? toDate(data.manufacturedAt) : existing.manufacturedAt,
              expiryDate: data.expiryDate !== undefined ? toDate(data.expiryDate) : existing.expiryDate,
              openedAt: data.openedAt !== undefined ? toDate(data.openedAt) : existing.openedAt,
              weightG: data.weightG !== undefined ? (data.weightG ?? null) : existing.weightG,
              purchaseUrl: data.purchaseUrl !== undefined ? (data.purchaseUrl ?? null) : existing.purchaseUrl,
              ...purchaseChanges,
            },
          });
        }
      }
      // 동시에 "다시 구매"가 끼어들었어도 Product가 행 기준 값으로 수렴한다
      await syncProductSnapshot(db as Prisma.TransactionClient, householdId, id);
      return written;
    };
    const count = touchesPurchase ? await prisma.$transaction((tx) => writeProduct(tx)) : await writeProduct(prisma);
    const updated =
      count > 0
        ? await prisma.product.findFirst({
            where: { id, ...householdWhere(householdId) },
            include: { pet: { select: { id: true, name: true } }, ...withPurchaseCount },
          })
        : null;
    if (!updated) {
      return reply.code(404).send({ error: t("productNotFound", request.locale) });
    }

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

    const { count } = await prisma.product.updateMany({
      where: { id, ...householdWhere(householdId) },
      data: { archivedAt: new Date(), isActive: false },
    });
    if (count === 0) {
      return reply.code(404).send({ error: t("productNotFound", request.locale) });
    }

    return reply.code(204).send();
  });

  // POST /api/products/:id/restore
  app.post("/:id/restore", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const { id } = request.params as { id: string };
    const existing = await prisma.product.findFirst({
      where: { id, ...householdWhere(householdId), archivedAt: { not: null } },
      include: { pet: { select: { id: true, name: true } }, ...withPurchaseCount },
    });
    if (!existing) {
      return reply.code(404).send({ error: t("productNotFound", request.locale) });
    }

    const { count } = await prisma.product.updateMany({
      where: { id, ...householdWhere(householdId) },
      data: { archivedAt: null, isActive: true },
    });
    const restored =
      count > 0
        ? await prisma.product.findFirst({
            where: { id, ...householdWhere(householdId) },
            include: { pet: { select: { id: true, name: true } }, ...withPurchaseCount },
          })
        : null;
    if (!restored) {
      return reply.code(404).send({ error: t("productNotFound", request.locale) });
    }

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
        await prisma.product.updateMany({
          where: { id, ...householdWhere(householdId) },
          data: { photoPath },
        });
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

      const { count } = await prisma.product.updateMany({
        where: { id, ...householdWhere(householdId) },
        data: { photoPath: photo.path },
      });
      const updated =
        count > 0
          ? await prisma.product.findFirst({
              where: { id, ...householdWhere(householdId) },
              include: { pet: { select: { id: true, name: true } }, ...withPurchaseCount },
            })
          : null;
      if (!updated) {
        return reply.code(404).send({ error: t("productNotFound", request.locale) });
      }

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

    const { count: removed } = await prisma.productPhoto.deleteMany({
      where: { id: photo.id, product: householdWhere(householdId) },
    });
    if (removed === 0) {
      return reply.code(404).send({ error: t("photoNotFound", request.locale) });
    }
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
      await prisma.product.updateMany({
        where: { id, ...householdWhere(householdId) },
        data: { photoPath: nextPrimaryPhotoPath(remaining) },
      });
    }

    return reply.code(204).send();
  });

}
