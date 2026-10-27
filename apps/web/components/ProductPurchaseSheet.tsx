"use client";

import { useEffect, useState } from "react";
import { hasFormDetails, kstDayKey, PURCHASE_COST_MAX } from "@kibble/shared";
import type { Product, ProductPurchase } from "../lib/types";
import { useLocale } from "../lib/i18n/locale-context";
import { useDialog } from "../lib/useDialog";
import { apiJson } from "../lib/api";
import {
  purchaseDraftFromRow,
  purchaseDraftToPayload,
  repurchaseDraft,
  STORE_MAX,
  type PurchaseDraft,
} from "../lib/productPurchaseDraft";
import { CalendarIcon } from "./ProductIcons";

type Props = {
  open: boolean;
  product: Product | null;
  /** 있으면 그 구매를 고친다. 없으면 "다시 구매" */
  purchase?: ProductPurchase | null;
  onClose: () => void;
  onSaved: () => void;
  showToast: (message: string, kind: "success" | "error" | "info") => void;
};

/** 열자마자 맞는 값이 그려지게 한다 — effect만 쓰면 직전에 열었던 값이 한 프레임 보인다 */
function initialDraft(product: Product | null, purchase?: ProductPurchase | null): PurchaseDraft {
  if (purchase) return purchaseDraftFromRow(purchase);
  return repurchaseDraft(
    product
      ? { costKrw: product.costKrw, purchaseUrl: product.purchaseUrl, weightG: product.weightG }
      : null,
    kstDayKey(new Date()),
  );
}

/**
 * 다시 구매 / 구매 기록 수정 (WORKPLAN §7.13). 제품은 그대로 두고 구매 한 건을 더한다.
 * 다시 구매는 지난 구매 값을 채워서 열고, 구매일은 오늘, 기한은 비워 둔다.
 */
export function ProductPurchaseSheet({ open, product, purchase, onClose, onSaved, showToast }: Props) {
  const { t } = useLocale();
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<PurchaseDraft>(() => initialDraft(product, purchase));
  const dialogRef = useDialog({ open, onClose, closeOnEscape: false, initialFocus: "container" });

  const editing = !!purchase;
  const productId = product?.id ?? null;
  // 중량 칸은 사료·영양제·간식·약에만 둔다. 기기·위생용품에는 묻지 않는다.
  const withWeight = product ? hasFormDetails(product.category) : false;

  useEffect(() => {
    if (!open || !product) return;
    if (purchase) {
      setDraft(purchaseDraftFromRow(purchase));
      return;
    }
    // 제품 스냅샷(가격·링크·중량)으로 먼저 열고, 지난 구매를 받아오면 구매처를 채운다.
    // 이미 사용자가 구매처를 적었다면 덮지 않는다.
    setDraft(
      repurchaseDraft(
        { costKrw: product.costKrw, purchaseUrl: product.purchaseUrl, weightG: product.weightG },
        kstDayKey(new Date()),
      ),
    );
    let cancelled = false;
    void apiJson<ProductPurchase[]>(`/api/products/${product.id}/purchases`)
      .then((rows) => {
        const latest = rows[0];
        if (cancelled || !latest?.store) return;
        setDraft((prev) => (prev.store ? prev : { ...prev, store: latest.store ?? "" }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // product 객체가 새로 와도(목록 갱신) 입력 중인 값을 덮지 않도록 id만 본다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, productId, purchase]);

  if (!open || !product) return null;

  function patch(partial: Partial<PurchaseDraft>) {
    setDraft((prev) => ({ ...prev, ...partial }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!product || saving) return;
    setSaving(true);
    try {
      const body = JSON.stringify(
        purchaseDraftToPayload(draft, withWeight, purchase ? purchaseDraftFromRow(purchase) : undefined),
      );
      if (purchase) {
        await apiJson(`/api/products/${product.id}/purchases/${purchase.id}`, { method: "PATCH", body });
      } else {
        await apiJson(`/api/products/${product.id}/purchases`, { method: "POST", body });
      }
      showToast(t("productPurchaseSavedToast"), "success");
      onSaved();
      onClose();
    } catch {
      showToast(t("saveError"), "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!product || !purchase || saving) return;
    if (!confirm(t("productPurchaseDeleteConfirm"))) return;
    setSaving(true);
    try {
      await apiJson(`/api/products/${product.id}/purchases/${purchase.id}`, { method: "DELETE" });
      showToast(t("productPurchaseDeletedToast"), "info");
      onSaved();
      onClose();
    } catch {
      showToast(t("saveError"), "error");
    } finally {
      setSaving(false);
    }
  }

  const title = editing ? t("productPurchaseEditTitle") : t("productRepurchaseTitle");

  return (
    <div className="sheet-backdrop" role="presentation" onClick={saving ? undefined : onClose}>
      <div
        ref={dialogRef}
        className="sheet-card product-edit-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <h2 className="product-sheet-title">{title}</h2>
        <p className="meta">
          {product.brand ? `${product.brand} · ` : ""}
          {product.name}
        </p>
        {!editing && (
          <p className="meta">
            {t("productRepurchaseHint")} {t("productRepurchaseDatesHint")}
          </p>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="product-sheet-form">
          <div className="field-row">
            <div className="field-group flex-1">
              <label className="field-label" htmlFor="purchase-date">
                {t("productPurchaseDateLabel")}
              </label>
              <input
                id="purchase-date"
                type="date"
                className="text-input"
                value={draft.purchasedAt}
                onChange={(e) => patch({ purchasedAt: e.target.value })}
                disabled={saving}
              />
            </div>
            <div className="field-group flex-1">
              <label className="field-label" htmlFor="purchase-cost">
                {t("productCostLabel")}
              </label>
              <input
                id="purchase-cost"
                type="number"
                inputMode="numeric"
                min="0"
                max={PURCHASE_COST_MAX}
                className="text-input"
                placeholder="35000"
                value={draft.cost}
                onChange={(e) => patch({ cost: e.target.value })}
                disabled={saving}
              />
            </div>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="purchase-store">
              {t("productPurchaseStoreLabel")}
            </label>
            <input
              id="purchase-store"
              type="text"
              className="text-input"
              maxLength={STORE_MAX}
              placeholder={t("productPurchaseStorePlaceholder")}
              value={draft.store}
              onChange={(e) => patch({ store: e.target.value })}
              disabled={saving}
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="purchase-url">
              {t("productPurchaseUrlLabel")}
            </label>
            <input
              id="purchase-url"
              type="text"
              inputMode="url"
              autoCapitalize="none"
              className="text-input"
              placeholder={t("productPurchaseUrlPlaceholder")}
              value={draft.url}
              onChange={(e) => patch({ url: e.target.value })}
              disabled={saving}
            />
          </div>

          {withWeight && (
            <div className="field-group">
              <label className="field-label" htmlFor="purchase-weight">
                {t("productWeightLabel")}
              </label>
              <div className="product-weight-row">
                <input
                  id="purchase-weight"
                  type="text"
                  inputMode="decimal"
                  className="text-input flex-1"
                  placeholder="2"
                  value={draft.weight}
                  onChange={(e) => patch({ weight: e.target.value })}
                  disabled={saving}
                />
                <select
                  className="select-input product-weight-unit"
                  aria-label={t("productWeightLabel")}
                  value={draft.weightUnit}
                  onChange={(e) => patch({ weightUnit: e.target.value as "kg" | "g" })}
                  disabled={saving}
                >
                  <option value="kg">{t("productWeightUnitKg")}</option>
                  <option value="g">{t("productWeightUnitG")}</option>
                </select>
              </div>
            </div>
          )}

          {/* 제조 → 유통기한 → 개봉. 시간 순서대로 읽힌다 */}
          <div className="field-row">
            <div className="field-group flex-1">
              <label className="field-label" htmlFor="purchase-expiry">
                {t("productExpiryDateLabel")}
              </label>
              <input
                id="purchase-expiry"
                type="date"
                className="text-input"
                value={draft.expiryDate}
                onChange={(e) => patch({ expiryDate: e.target.value })}
                disabled={saving}
              />
            </div>
            <div className="field-group flex-1">
              <label className="field-label" htmlFor="purchase-manufactured">
                {t("productManufacturedAtLabel")}
              </label>
              <input
                id="purchase-manufactured"
                type="date"
                className="text-input"
                value={draft.manufacturedAt}
                onChange={(e) => patch({ manufacturedAt: e.target.value })}
                disabled={saving}
              />
            </div>
          </div>

          <div className="field-group">
            <div className="label-with-action">
              <label className="field-label" htmlFor="purchase-opened">
                {t("productOpenedAtLabel")}
              </label>
              <button
                type="button"
                className="text-btn small product-opened-today-btn"
                onClick={() => patch({ openedAt: kstDayKey(new Date()) })}
                disabled={saving}
              >
                <CalendarIcon size={13} />
                <span>{t("productOpenedToday")}</span>
              </button>
            </div>
            <input
              id="purchase-opened"
              type="date"
              className="text-input"
              value={draft.openedAt}
              onChange={(e) => patch({ openedAt: e.target.value })}
              disabled={saving}
            />
          </div>

          <div className="form-actions">
            {editing && (
              <button type="button" className="danger" onClick={() => void handleDelete()} disabled={saving}>
                {t("productPurchaseDeleteBtn")}
              </button>
            )}
            <button type="button" className="secondary" onClick={onClose} disabled={saving}>
              {t("cancel")}
            </button>
            <button type="submit" className="primary" disabled={saving}>
              {saving ? t("saving") : t("productPurchaseSaveBtn")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
