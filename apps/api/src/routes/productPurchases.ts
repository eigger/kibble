import type { FastifyInstance } from "fastify";
import type { ProductPurchase } from "@prisma/client";
import { createProductPurchaseSchema, updateProductPurchaseSchema } from "@kibble/shared";
import { prisma } from "../lib/prisma.js";
import { t } from "../lib/i18n.js";
import { householdWhere, requireHouseholdId, requireHouseholdWrite } from "../lib/householdScope.js";
import { serializeProduct } from "../lib/serializeProduct.js";
import { sortPurchases } from "../lib/productPurchaseSnapshot.js";
import { syncProductSnapshot } from "../services/productPurchase.js";

function serializePurchase(row: ProductPurchase) {
  return {
    ...row,
    purchasedAt: row.purchasedAt?.toISOString() ?? null,
    manufacturedAt: row.manufacturedAt?.toISOString() ?? null,
    expiryDate: row.expiryDate?.toISOString() ?? null,
    openedAt: row.openedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const toDate = (v: string | null | undefined) => (v ? new Date(v) : null);

/**
 * 제품 구매 이력 (WORKPLAN §7.13). "다시 구매"가 여기로 들어온다.
 * 쓰기는 항상 같은 트랜잭션에서 Product 스냅샷을 다시 계산한다. GET은 쓰지 않는다 (K-7).
 */
export async function productPurchaseRoutes(app: FastifyInstance) {
  async function loadProduct(householdId: string, id: string) {
    return prisma.product.findFirst({
      where: { id, ...householdWhere(householdId) },
      include: { pet: { select: { id: true, name: true } }, _count: { select: { purchases: true } } },
    });
  }

  // GET /api/products/:id/purchases — 최신순
  app.get("/:id/purchases", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdId(request, reply);
    if (!householdId) return;

    const { id } = request.params as { id: string };
    const product = await prisma.product.findFirst({
      where: { id, ...householdWhere(householdId) },
      select: { id: true },
    });
    if (!product) {
      return reply.code(404).send({ error: t("productNotFound", request.locale) });
    }

    const rows = await prisma.productPurchase.findMany({
      where: { productId: id, ...householdWhere(householdId) },
    });
    return sortPurchases(rows).map(serializePurchase);
  });

  // POST /api/products/:id/purchases — 다시 구매
  app.post("/:id/purchases", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const { id } = request.params as { id: string };
    const parsed = createProductPurchaseSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const product = await prisma.product.findFirst({
      where: { id, ...householdWhere(householdId) },
      select: { id: true, archivedAt: true },
    });
    if (!product) {
      return reply.code(404).send({ error: t("productNotFound", request.locale) });
    }

    const data = parsed.data;
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.productPurchase.create({
        data: {
          householdId,
          productId: id,
          // 생략은 "지금 샀다", 명시적 null은 "구매일 모름"
          purchasedAt: data.purchasedAt === undefined ? new Date() : toDate(data.purchasedAt),
          costKrw: data.costKrw ?? null,
          weightG: data.weightG ?? null,
          store: data.store ?? null,
          purchaseUrl: data.purchaseUrl ?? null,
          manufacturedAt: toDate(data.manufacturedAt),
          expiryDate: toDate(data.expiryDate),
          openedAt: toDate(data.openedAt),
        },
      });
      // 보관한 제품을 다시 샀다면 쓰겠다는 뜻이다
      if (product.archivedAt) {
        await tx.product.updateMany({
          where: { id, ...householdWhere(householdId) },
          data: { archivedAt: null, isActive: true },
        });
      }
      await syncProductSnapshot(tx, householdId, id, row.id);
      return row;
    });

    const updated = await loadProduct(householdId, id);
    if (!updated) {
      return reply.code(404).send({ error: t("productNotFound", request.locale) });
    }
    return reply.code(201).send({
      purchase: serializePurchase(created),
      product: { ...serializeProduct(updated), pet: updated.pet },
    });
  });

  // PATCH /api/products/:id/purchases/:purchaseId
  app.patch("/:id/purchases/:purchaseId", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const { id, purchaseId } = request.params as { id: string; purchaseId: string };
    const parsed = updateProductPurchaseSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const existing = await prisma.productPurchase.findFirst({
      where: { id: purchaseId, productId: id, ...householdWhere(householdId) },
      select: { id: true },
    });
    if (!existing) {
      return reply.code(404).send({ error: t("purchaseNotFound", request.locale) });
    }

    const data = parsed.data;
    const update: Record<string, unknown> = {};
    if (data.purchasedAt !== undefined) update.purchasedAt = toDate(data.purchasedAt);
    if (data.costKrw !== undefined) update.costKrw = data.costKrw;
    if (data.weightG !== undefined) update.weightG = data.weightG;
    if (data.store !== undefined) update.store = data.store;
    if (data.purchaseUrl !== undefined) update.purchaseUrl = data.purchaseUrl;
    if (data.manufacturedAt !== undefined) update.manufacturedAt = toDate(data.manufacturedAt);
    if (data.expiryDate !== undefined) update.expiryDate = toDate(data.expiryDate);
    if (data.openedAt !== undefined) update.openedAt = toDate(data.openedAt);

    const row = await prisma.$transaction(async (tx) => {
      const { count } = await tx.productPurchase.updateMany({
        where: { id: purchaseId, productId: id, ...householdWhere(householdId) },
        data: update,
      });
      if (count === 0) return null;
      await syncProductSnapshot(tx, householdId, id, purchaseId);
      return tx.productPurchase.findFirst({
        where: { id: purchaseId, productId: id, ...householdWhere(householdId) },
      });
    });
    if (!row) {
      return reply.code(404).send({ error: t("purchaseNotFound", request.locale) });
    }

    const updated = await loadProduct(householdId, id);
    if (!updated) {
      return reply.code(404).send({ error: t("productNotFound", request.locale) });
    }
    return {
      purchase: serializePurchase(row),
      product: { ...serializeProduct(updated), pet: updated.pet },
    };
  });

  // DELETE /api/products/:id/purchases/:purchaseId
  app.delete("/:id/purchases/:purchaseId", { preHandler: [app.authenticate] }, async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const { id, purchaseId } = request.params as { id: string; purchaseId: string };
    const existing = await prisma.productPurchase.findFirst({
      where: { id: purchaseId, productId: id, ...householdWhere(householdId) },
      select: { id: true },
    });
    if (!existing) {
      return reply.code(404).send({ error: t("purchaseNotFound", request.locale) });
    }

    const removed = await prisma.$transaction(async (tx) => {
      const { count } = await tx.productPurchase.deleteMany({
        where: { id: purchaseId, productId: id, ...householdWhere(householdId) },
      });
      if (count === 0) return false;
      await syncProductSnapshot(tx, householdId, id);
      return true;
    });
    if (!removed) {
      return reply.code(404).send({ error: t("purchaseNotFound", request.locale) });
    }
    return reply.code(204).send();
  });
}
