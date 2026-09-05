"use client";

import { useState } from "react";
import { kstDayDiff } from "@kibble/shared";
import type { Product } from "../lib/types";
import { useLocale } from "../lib/i18n/locale-context";
import { ProductPhoto } from "./ProductPhoto";
import {
  PackageIcon,
  ExternalLinkIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  AlertCircleIcon,
} from "./ProductIcons";

type Props = {
  product: Product | null;
  open: boolean;
  onClose: () => void;
  onEdit?: (product: Product) => void;
};

export function ProductDetailSheet({ product, open, onClose, onEdit }: Props) {
  const { t, locale } = useLocale();
  const [ingredientsOpen, setIngredientsOpen] = useState(false);

  if (!open || !product) return null;

  // D-Day calculation (KST)
  let ddayInfo: { label: string; isExpired: boolean; isImminent: boolean } | null = null;
  if (product.expiryDate) {
    const diffDays = kstDayDiff(new Date(product.expiryDate));
    if (diffDays < 0) {
      ddayInfo = { label: t("productDdayExpired"), isExpired: true, isImminent: false };
    } else if (diffDays === 0) {
      ddayInfo = { label: t("productDdayToday"), isExpired: false, isImminent: true };
    } else {
      ddayInfo = {
        label: t("productDdayDays", { days: String(diffDays) }),
        isExpired: false,
        isImminent: diffDays <= 30,
      };
    }
  }

  // Opened days calculation (KST)
  let openedDays: number | null = null;
  if (product.openedAt) {
    openedDays = Math.max(0, kstDayDiff(new Date(), new Date(product.openedAt)));
  }

  function formatKstDate(iso: string): string {
    return new Date(iso).toLocaleDateString(locale === "ko" ? "ko-KR" : "en-US", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  const categoryLabelMap: Record<string, string> = {
    MEAL: t("productCategoryMeal"),
    SUPPLEMENT: t("productCategorySupplement"),
    TREAT: t("productCategoryTreat"),
    HYGIENE: t("productCategoryHygiene"),
    DEVICE: t("productCategoryDevice"),
    OTHER: t("productCategoryOther"),
  };

  const palatabilityMap: Record<string, string> = {
    HIGH: t("productPalatabilityHigh"),
    MEDIUM: t("productPalatabilityMedium"),
    LOW: t("productPalatabilityLow"),
  };

  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <div
        className="sheet-card product-detail-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={product.name}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />

        {/* Header with Photo & Name */}
        <div className="product-popup-header">
          <div className="product-popup-photo-wrap">
            {product.photoPath ? (
              <ProductPhoto
                productId={product.id}
                photoPath={product.photoPath}
                alt={product.name}
                className="product-popup-photo"
              />
            ) : (
              <div className="product-popup-photo-placeholder">
                <PackageIcon size={28} />
              </div>
            )}
          </div>

          <div className="product-popup-titles">
            <div className="product-popup-badge-row">
              <span className="product-category-badge small">
                {categoryLabelMap[product.category] ?? product.category}
              </span>
              <span
                className={`product-status-badge ${
                  product.isActive ? "product-status-active" : "product-status-inactive"
                }`}
              >
                <span className={`status-dot ${product.isActive ? "" : "status-dot-inactive"}`} />
                <span>{product.isActive ? t("productStatusActiveShort") : t("productStatusInactiveShort")}</span>
              </span>
              {product.pet ? (
                <span className="product-pet-badge small">{product.pet.name}</span>
              ) : (
                <span className="product-pet-badge small product-pet-shared">{t("productPetShared")}</span>
              )}
            </div>

            {product.brand ? <div className="product-popup-brand">{product.brand}</div> : null}
            <h2 className="product-popup-name">{product.name}</h2>
          </div>
        </div>

        <div className="product-popup-body">
          {/* Key Dates: Expiration & Opened */}
          {(ddayInfo || openedDays != null) && (
            <div className="product-info-card product-dates-card">
              {ddayInfo && (
                <div className="product-date-item">
                  <span className="product-info-label">{t("productExpiryDateLabel")}</span>
                  <div className="product-dday-wrap">
                    <span
                      className={`product-dday-badge ${
                        ddayInfo.isExpired
                          ? "dday-expired"
                          : ddayInfo.isImminent
                            ? "dday-imminent"
                            : "dday-normal"
                      }`}
                    >
                      {ddayInfo.label}
                    </span>
                    <span className="product-date-sub">
                      {formatKstDate(product.expiryDate!)}
                    </span>
                  </div>
                </div>
              )}

              {openedDays != null && (
                <div className="product-date-item">
                  <span className="product-info-label">{t("productOpenedAtLabel")}</span>
                  <div className="product-opened-wrap">
                    <span className="product-opened-badge">
                      {t("productOpenedDaysAgo", { days: String(openedDays) })}
                    </span>
                    <span className="product-date-sub">
                      {formatKstDate(product.openedAt!)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Dosage / Feeding Guide */}
          {product.dosage && (
            <div className="product-info-card product-dosage-card">
              <span className="product-info-label">{t("productDosageLabel")}</span>
              <p className="product-dosage-text">{product.dosage}</p>
            </div>
          )}

          {/* Palatability & Adverse Reactions */}
          {(product.palatability || (product.adverseReactions && product.adverseReactions.length > 0)) && (
            <div className="product-info-card product-reaction-card">
              {product.palatability && (
                <div className="product-reaction-row">
                  <span className="product-info-label">{t("productPalatabilityLabel")}</span>
                  <span className="product-palatability-tag">
                    {palatabilityMap[product.palatability] ?? product.palatability}
                  </span>
                </div>
              )}

              {product.adverseReactions && product.adverseReactions.length > 0 && (
                <div className="product-adverse-section">
                  <span className="product-info-label product-adverse-label">
                    <AlertCircleIcon size={13} />
                    <span>{t("productAdverseReactionsLabel")}</span>
                  </span>
                  <div className="product-adverse-chips">
                    {product.adverseReactions.map((tag) => (
                      <span key={tag} className="product-adverse-chip">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Purchase Info & Reorder Link */}
          {(product.costKrw != null || product.purchaseDate || product.purchaseUrl) && (
            <div className="product-info-card product-purchase-card">
              <div className="product-purchase-row">
                {product.costKrw != null && (
                  <div>
                    <span className="product-info-label">{t("productCostLabel")}</span>
                    <div className="product-cost-val">
                      {product.costKrw.toLocaleString()}
                      {t("eventDetailCostUnit")}
                    </div>
                  </div>
                )}
                {product.purchaseDate && (
                  <div>
                    <span className="product-info-label">{t("productPurchaseDateLabel")}</span>
                    <div className="product-purchase-date-val">
                      {formatKstDate(product.purchaseDate)}
                    </div>
                  </div>
                )}
              </div>

              {product.purchaseUrl && /^https?:\/\//i.test(product.purchaseUrl) && (
                <a
                  href={product.purchaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="button primary product-buy-link-btn"
                >
                  <span>{t("productPurchaseUrlButton")}</span>
                  <ExternalLinkIcon size={14} />
                </a>
              )}
            </div>
          )}

          {/* Ingredients Accordion */}
          {product.ingredients && (
            <div className="product-info-card product-ingredients-card">
              <button
                type="button"
                className="product-accordion-trigger"
                onClick={() => setIngredientsOpen((prev) => !prev)}
                aria-expanded={ingredientsOpen}
              >
                <span>{t("productIngredientsLabel")}</span>
                <span>{ingredientsOpen ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}</span>
              </button>
              {ingredientsOpen && (
                <div className="product-ingredients-content">
                  <p>{product.ingredients}</p>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          {product.notes && (
            <div className="product-info-card product-notes-card">
              <span className="product-info-label">{t("productNotesLabel")}</span>
              <p className="product-notes-text">{product.notes}</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="sheet-actions product-popup-actions">
          {onEdit && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                onClose();
                onEdit(product);
              }}
            >
              {t("edit")}
            </button>
          )}
          <button type="button" className="primary" onClick={onClose}>
            {t("close")}
          </button>
        </div>
      </div>
    </div>
  );
}
