"use client";

import { useEffect, useState } from "react";
import { formatWeightG, kstDayDiff } from "@kibble/shared";
import type { Product, ProductPhotoMeta } from "../lib/types";
import { useLocale } from "../lib/i18n/locale-context";
import { apiJson } from "../lib/api";
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
  // 사진 미리보기. 대표든 썸네일이든 누르면 크게 본다.
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPhotoId, setPreviewPhotoId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<ProductPhotoMeta[]>([]);

  const productId = product?.id ?? null;
  const embeddedPhotos = product?.photos;

  useEffect(() => {
    setPreviewOpen(false);
    setPreviewPhotoId(null);
    if (!open || !productId) {
      setPhotos([]);
      return;
    }
    if (embeddedPhotos) {
      setPhotos(embeddedPhotos);
      return;
    }
    // 목록에서 연 경우 product.photos가 없다 — 카드는 대표 한 장만 받기 때문이다.
    let cancelled = false;
    void apiJson<ProductPhotoMeta[]>(`/api/products/${productId}/photos`)
      .then((rows) => {
        if (!cancelled) setPhotos(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, productId, embeddedPhotos]);

  function openPreview(photoId?: string) {
    setPreviewPhotoId(photoId ?? photos.find((p) => p.isPrimary)?.id ?? null);
    setPreviewOpen(true);
  }

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
    MEDICATION: t("productCategoryMedication"),
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

  const formMap: Record<string, string> = {
    DRY: t("productFormDry"),
    WET: t("productFormWet"),
    SEMI_MOIST: t("productFormSemiMoist"),
    GEL: t("productFormGel"),
    LICKABLE: t("productFormLickable"),
    CHEWY: t("productFormChewy"),
    POWDER: t("productFormPowder"),
    CAPSULE: t("productFormCapsule"),
    TABLET: t("productFormTablet"),
    LIQUID: t("productFormLiquid"),
  };

  const kibbleSizeMap: Record<string, string> = {
    SMALL: t("productKibbleSizeSmall"),
    MEDIUM: t("productKibbleSizeMedium"),
    LARGE: t("productKibbleSizeLarge"),
  };

  // "이게 어떤 물건인가"를 한 줄씩. 편집 시트와 같은 묶음·순서로 읽히게 한다:
  // 무엇에 쓰나 → 무엇으로 만들었나 → 어떤 형태·크기인가 → 어디서 왔나 → 어떻게 다루나.
  const specs: { label: string; value: string }[] = [];
  if (product.usage) {
    specs.push({ label: t("productUsageLabel"), value: product.usage });
  }
  if (product.mainIngredients) {
    specs.push({ label: t("productMainIngredientsLabel"), value: product.mainIngredients });
  }
  if (product.registeredIngredients) {
    specs.push({
      label: t("productRegisteredIngredientsLabel"),
      value: product.registeredIngredients,
    });
  }
  if (product.ingredientRegistrationNo) {
    specs.push({
      label: t("productRegistrationNoLabel"),
      value: product.ingredientRegistrationNo,
    });
  }
  if (product.flavor) {
    specs.push({ label: t("productFlavorLabel"), value: product.flavor });
  }
  if (product.form) {
    const size = product.kibbleSize ? kibbleSizeMap[product.kibbleSize] : null;
    specs.push({
      label: t("productFormLabel"),
      value: size ? `${formMap[product.form]} · ${size}` : formMap[product.form],
    });
  }
  const weightLabel = formatWeightG(product.weightG);
  if (weightLabel) specs.push({ label: t("productWeightLabel"), value: weightLabel });
  if (product.origin) specs.push({ label: t("productOriginLabel"), value: product.origin });
  if (product.importer) specs.push({ label: t("productImporterLabel"), value: product.importer });
  if (product.manufacturedAt) {
    specs.push({ label: t("productManufacturedAtLabel"), value: formatKstDate(product.manufacturedAt) });
  }
  if (product.storage) specs.push({ label: t("productStorageLabel"), value: product.storage });

  if (previewOpen && (previewPhotoId || product.photoPath)) {
    // 시트 위에 겹치지 않고 갈아 끼운다 — 배경 두 겹이 쌓이면 닫기 대상이 헷갈린다.
    return (
      <div
        className="attachment-lightbox-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label={t("productPhotoPreview")}
        onClick={() => setPreviewOpen(false)}
      >
        <button
          type="button"
          className="attachment-lightbox-close"
          onClick={() => setPreviewOpen(false)}
        >
          {t("close")}
        </button>
        <div className="attachment-lightbox-body" onClick={(e) => e.stopPropagation()}>
          <ProductPhoto
            productId={product.id}
            photoPath={previewPhotoId ? null : product.photoPath}
            photoId={previewPhotoId}
            alt={product.name}
            className="attachment-lightbox-media"
          />
        </div>
      </div>
    );
  }

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
          {product.photoPath ? (
            <button
              type="button"
              className="product-popup-photo-wrap"
              aria-label={t("productPhotoPreview")}
              onClick={() => openPreview()}
            >
              <ProductPhoto
                productId={product.id}
                photoPath={product.photoPath}
                alt={product.name}
                className="product-popup-photo"
              />
            </button>
          ) : (
            <div className="product-popup-photo-wrap">
              <div className="product-popup-photo-placeholder">
                <PackageIcon size={28} />
              </div>
            </div>
          )}

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

        {/* 헤더(flex 행) 밖에 둔다 — 안에 넣으면 사진 수만큼 가로를 먹어 제목이
            찌그러진다 (R107). 이력 첨부 줄과 같은 모양이고, 누르면 라이트박스다. */}
        {photos.length > 0 && (
          <div className="product-photo-thumbs">
            {photos.map((photo) => (
              <button
                key={photo.id}
                type="button"
                className={`product-photo-thumb ${photo.isPrimary ? "is-primary" : ""}`}
                aria-label={t("productPhotoPreview")}
                onClick={() => openPreview(photo.id)}
              >
                <ProductPhoto
                  productId={product.id}
                  photoId={photo.id}
                  alt=""
                  className="product-preview-img"
                />
              </button>
            ))}
          </div>
        )}

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

          {specs.length > 0 && (
            <div className="product-info-card">
              {/* 한 항목당 한 줄. 라벨 왼쪽·값 오른쪽이라 짧은 값은 한 줄에 끝나고
                  등록성분처럼 긴 값만 값 칸 안에서 접힌다. */}
              <dl className="product-spec-list">
                {specs.map((spec) => (
                  <div key={spec.label} className="product-spec-row">
                    <dt className="product-spec-key">{spec.label}</dt>
                    <dd className="product-spec-val">{spec.value}</dd>
                  </div>
                ))}
              </dl>
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
