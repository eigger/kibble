"use client";

import { useEffect, useState, useRef } from "react";
import type {
  Pet,
  Product,
  ProductCategory,
  Palatability,
  ProductForm,
  KibbleSize,
  ProductPhotoMeta,
} from "../lib/types";
import { hasFormDetails, weightToGrams } from "@kibble/shared";
import { useLocale } from "../lib/i18n/locale-context";
import { apiJson, apiFetch } from "../lib/api";
import { MAX_PRODUCT_PHOTOS } from "@kibble/shared";
import { ProductPhoto } from "./ProductPhoto";
import { CameraIcon, CalendarIcon, ChevronDownIcon, ChevronUpIcon } from "./ProductIcons";

type Props = {
  open: boolean;
  mode: "add" | "edit";
  product?: Product | null;
  pets: Pet[];
  onClose: () => void;
  onSaved: () => void;
  onArchived?: () => void;
  showToast: (message: string, kind: "success" | "error" | "info") => void;
};

export function ProductEditSheet({
  open,
  mode,
  product,
  pets,
  onClose,
  onSaved,
  onArchived,
  showToast,
}: Props) {
  const { t } = useLocale();

  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState<ProductCategory>("MEAL");
  const [petId, setPetId] = useState<string>("");
  const [dosage, setDosage] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [mainIngredients, setMainIngredients] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [openedAt, setOpenedAt] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [costKrw, setCostKrw] = useState("");
  const [purchaseUrl, setPurchaseUrl] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [palatability, setPalatability] = useState<Palatability | "">("");
  const [origin, setOrigin] = useState("");
  const [form, setForm] = useState<ProductForm | "">("");
  const [kibbleSize, setKibbleSize] = useState<KibbleSize | "">("");
  // 저장은 g으로 통일하고, 입력만 kg/g을 고른다. 2kg을 2000이라고 쓰게 하지 않는다.
  const [weight, setWeight] = useState("");
  const [weightUnit, setWeightUnit] = useState<"kg" | "g">("kg");
  const [adverseReactions, setAdverseReactions] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState("");
  const [notes, setNotes] = useState("");

  // 이미 올라간 사진 / 지울 것 / 대표 변경 / 새로 붙일 파일. 서버 반영은 저장할 때
  // 한 번에 한다 — 이벤트 첨부의 removedAttachmentIds와 같은 방식이다.
  const [photos, setPhotos] = useState<ProductPhotoMeta[]>([]);
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([]);
  const [pendingPrimaryId, setPendingPrimaryId] = useState<string | null>(null);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [newPreviews, setNewPreviews] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Collapsible section states
  const [showFeeding, setShowFeeding] = useState(false);
  const [showDates, setShowDates] = useState(false);
  const [showPurchase, setShowPurchase] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;

    if (mode === "edit" && product) {
      setName(product.name ?? "");
      setBrand(product.brand ?? "");
      setCategory(product.category ?? "MEAL");
      setPetId(product.petId ?? "");
      setDosage(product.dosage ?? "");
      setIngredients(product.ingredients ?? "");
      setMainIngredients(product.mainIngredients ?? "");
      setExpiryDate(product.expiryDate ? product.expiryDate.slice(0, 10) : "");
      setOpenedAt(product.openedAt ? product.openedAt.slice(0, 10) : "");
      setPurchaseDate(product.purchaseDate ? product.purchaseDate.slice(0, 10) : "");
      setCostKrw(product.costKrw != null ? String(product.costKrw) : "");
      setPurchaseUrl(product.purchaseUrl ?? "");
      setIsActive(product.isActive ?? true);
      setPalatability(product.palatability ?? "");
      setOrigin(product.origin ?? "");
      setForm(product.form ?? "");
      setKibbleSize(product.kibbleSize ?? "");
      if (product.weightG == null) {
        setWeight("");
        setWeightUnit("kg");
      } else if (product.weightG >= 1000 && product.weightG % 100 === 0) {
        // 2000g은 사람이 "2kg"이라고 산다. 1000으로 안 떨어지는 값만 g으로 보여준다.
        setWeight(String(product.weightG / 1000));
        setWeightUnit("kg");
      } else {
        setWeight(String(product.weightG));
        setWeightUnit("g");
      }
      setAdverseReactions(product.adverseReactions ?? []);
      setNotes(product.notes ?? "");

      // Auto-open sections if they have values
      if (
        product.dosage ||
        product.mainIngredients ||
        product.ingredients ||
        product.palatability ||
        (product.adverseReactions?.length ?? 0) > 0
      ) {
        setShowFeeding(true);
      }
      if (product.expiryDate || product.openedAt) {
        setShowDates(true);
      }
      if (
        product.costKrw != null ||
        product.purchaseDate ||
        product.purchaseUrl ||
        product.origin ||
        product.form ||
        product.weightG != null
      ) {
        setShowPurchase(true);
      }
    } else {
      // Add mode defaults
      setName("");
      setBrand("");
      setCategory("MEAL");
      setPetId("");
      setDosage("");
      setIngredients("");
      setMainIngredients("");
      setExpiryDate("");
      setOpenedAt("");
      setPurchaseDate("");
      setCostKrw("");
      setPurchaseUrl("");
      setIsActive(true);
      setPalatability("");
      setOrigin("");
      setForm("");
      setKibbleSize("");
      setWeight("");
      setWeightUnit("kg");
      setAdverseReactions([]);
      setNotes("");
      setShowFeeding(false);
      setShowDates(false);
      setShowPurchase(false);
    }
    setRemovedPhotoIds([]);
    setPendingPrimaryId(null);
    setNewFiles([]);
    setNewPreviews((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return [];
    });
    setPhotos(mode === "edit" && product?.photos ? product.photos : []);
    setNewTagInput("");

    // 목록에서 연 경우 product.photos가 없다. 상세를 한 번 더 읽어 채운다.
    if (mode === "edit" && product && !product.photos) {
      let cancelled = false;
      void apiJson<ProductPhotoMeta[]>(`/api/products/${product.id}/photos`)
        .then((rows) => {
          if (!cancelled) setPhotos(rows);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }
  }, [open, mode, product]);

  // 기기·위생용품에 "알갱이 크기"를 묻지 않는다. 사료·영양제·간식만.
  const showFormDetails = hasFormDetails(category);

  if (!open) return null;

  function handleAddTag() {
    const trimmed = newTagInput.trim();
    if (!trimmed) return;
    if (!adverseReactions.includes(trimmed)) {
      setAdverseReactions((prev) => [...prev, trimmed]);
    }
    setNewTagInput("");
  }

  function handleRemoveTag(tag: string) {
    setAdverseReactions((prev) => prev.filter((t) => t !== tag));
  }

  const keptPhotos = photos.filter((p) => !removedPhotoIds.includes(p.id));
  const primaryId =
    pendingPrimaryId ?? keptPhotos.find((p) => p.isPrimary)?.id ?? keptPhotos[0]?.id ?? null;
  const photoCount = keptPhotos.length + newFiles.length;

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    const room = MAX_PRODUCT_PHOTOS - photoCount;
    if (room <= 0) {
      showToast(t("productPhotoLimit", { max: String(MAX_PRODUCT_PHOTOS) }), "error");
      e.target.value = "";
      return;
    }
    const accepted = picked.slice(0, room);
    if (accepted.length < picked.length) {
      showToast(t("productPhotoLimit", { max: String(MAX_PRODUCT_PHOTOS) }), "error");
    }
    setNewFiles((prev) => [...prev, ...accepted]);
    setNewPreviews((prev) => [...prev, ...accepted.map((f) => URL.createObjectURL(f))]);
    // 같은 파일을 다시 고를 수 있게 비운다
    e.target.value = "";
  }

  function handleRemoveExistingPhoto(photoId: string) {
    setRemovedPhotoIds((prev) => [...prev, photoId]);
    if (pendingPrimaryId === photoId) setPendingPrimaryId(null);
  }

  function handleRemoveNewPhoto(index: number) {
    URL.revokeObjectURL(newPreviews[index]);
    setNewFiles((prev) => prev.filter((_, i) => i !== index));
    setNewPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  function handleMarkOpenedToday() {
    const today = new Date().toISOString().slice(0, 10);
    setOpenedAt(today);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      showToast(t("productNameLabel") + " required", "error");
      return;
    }

    setSaving(true);
    try {
      const rawUrl = purchaseUrl.trim();
      let normalizedUrl: string | null = null;
      if (rawUrl && !/^(javascript|data|vbscript):/i.test(rawUrl)) {
        normalizedUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
      }

      const payload = {
        name: name.trim(),
        brand: brand.trim() || null,
        category,
        petId: petId || null,
        dosage: dosage.trim() || null,
        mainIngredients: showFormDetails ? mainIngredients.trim() || null : null,
        ingredients: ingredients.trim() || null,
        expiryDate: expiryDate ? new Date(`${expiryDate}T00:00:00.000Z`).toISOString() : null,
        openedAt: openedAt ? new Date(`${openedAt}T00:00:00.000Z`).toISOString() : null,
        purchaseDate: purchaseDate ? new Date(`${purchaseDate}T00:00:00.000Z`).toISOString() : null,
        costKrw: costKrw ? Number(costKrw) : null,
        purchaseUrl: normalizedUrl,
        isActive,
        palatability: palatability || null,
        origin: showFormDetails ? origin.trim() || null : null,
        form: showFormDetails ? form || null : null,
        // 건식이 아니면 서버도 버리지만, 보내지 않는 편이 의도가 분명하다
        kibbleSize: showFormDetails && form === "DRY" ? kibbleSize || null : null,
        weightG: showFormDetails ? weightToGrams(weight, weightUnit) : null,
        adverseReactions,
        notes: notes.trim() || null,
      };

      let savedId: string;
      if (mode === "add") {
        const created = await apiJson<Product>("/api/products", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        savedId = created.id;
      } else if (product) {
        const updated = await apiJson<Product>(`/api/products/${product.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        savedId = updated.id;
      } else {
        return;
      }

      if (savedId) {
        // 지우기 → 새로 올리기 → 대표 지정 순서. 대표를 마지막에 둬야 삭제로 밀려난
        // 대표가 사용자가 고른 값을 덮지 않는다.
        for (const photoId of removedPhotoIds) {
          await apiFetch(`/api/products/${savedId}/photos/${photoId}`, { method: "DELETE" });
        }
        for (const file of newFiles) {
          const formData = new FormData();
          formData.append("file", file);
          await apiFetch(`/api/products/${savedId}/photos`, { method: "POST", body: formData });
        }
        const alreadyPrimary = keptPhotos.find((p) => p.isPrimary)?.id ?? null;
        if (primaryId && primaryId !== alreadyPrimary) {
          await apiFetch(`/api/products/${savedId}/photos/${primaryId}/primary`, {
            method: "POST",
          });
        }
      }

      showToast(t("productSavedToast"), "success");
      onSaved();
      onClose();
    } catch {
      showToast(t("saveError"), "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!product || saving) return;
    if (!confirm(t("productDeleteConfirm"))) return;

    setSaving(true);
    try {
      await apiJson(`/api/products/${product.id}`, { method: "DELETE" });
      showToast(t("productDeletedToast"), "info");
      onArchived?.();
      onClose();
    } catch {
      showToast(t("saveError"), "error");
    } finally {
      setSaving(false);
    }
  }

  const title = mode === "add" ? t("productAddBtn") : t("productEditBtn");

  return (
    <div className="sheet-backdrop" role="presentation" onClick={saving ? undefined : onClose}>
      <div
        className="sheet-card product-edit-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <h2 className="product-sheet-title">{title}</h2>

        <form onSubmit={(e) => void handleSubmit(e)} className="product-sheet-form">
          {/* 1. Basic essential fields */}
          <div className="field-group">
            <label className="field-label" htmlFor="prod-name">
              {t("productNameLabel")} <span className="required">*</span>
            </label>
            <input
              id="prod-name"
              type="text"
              className="text-input"
              required
              placeholder={t("productNamePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="field-row">
            <div className="field-group flex-1">
              <label className="field-label" htmlFor="prod-category">
                {t("productCategoryLabel")}
              </label>
              <select
                id="prod-category"
                className="select-input"
                value={category}
                onChange={(e) => setCategory(e.target.value as ProductCategory)}
                disabled={saving}
              >
                <option value="MEAL">{t("productCategoryMeal")}</option>
                <option value="SUPPLEMENT">{t("productCategorySupplement")}</option>
                <option value="TREAT">{t("productCategoryTreat")}</option>
                <option value="HYGIENE">{t("productCategoryHygiene")}</option>
                <option value="DEVICE">{t("productCategoryDevice")}</option>
                <option value="OTHER">{t("productCategoryOther")}</option>
              </select>
            </div>

            <div className="field-group flex-1">
              <label className="field-label" htmlFor="prod-pet">
                {t("productPetLabel")}
              </label>
              <select
                id="prod-pet"
                className="select-input"
                value={petId}
                onChange={(e) => setPetId(e.target.value)}
                disabled={saving}
              >
                <option value="">{t("productPetShared")}</option>
                {pets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field-row">
            <div className="field-group flex-1">
              <label className="field-label" htmlFor="prod-brand">
                {t("productBrandLabel")}
              </label>
              <input
                id="prod-brand"
                type="text"
                className="text-input"
                placeholder={t("productBrandPlaceholder")}
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="field-group flex-1 product-active-toggle-wrap">
              <label className="field-label">{t("productStatusActiveShort")}</label>
              <button
                type="button"
                className={`button toggle-btn ${isActive ? "active" : "inactive"}`}
                onClick={() => setIsActive((prev) => !prev)}
                disabled={saving}
              >
                <span className={`status-dot ${isActive ? "" : "status-dot-inactive"}`} />
                <span>{isActive ? t("productStatusActive") : t("productStatusInactive")}</span>
              </button>
            </div>
          </div>

          {/* 2. Collapsible: Photo */}
          <div className="product-form-section">
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              accept="image/*"
              multiple
              onChange={handlePhotoChange}
            />

            <div className="product-photo-grid">
              {keptPhotos.map((photo) => (
                <div
                  key={photo.id}
                  className={`product-photo-cell ${photo.id === primaryId ? "is-primary" : ""}`}
                >
                  <ProductPhoto
                    productId={product?.id ?? ""}
                    photoId={photo.id}
                    alt=""
                    className="product-preview-img"
                  />
                  {photo.id === primaryId ? (
                    <span className="product-photo-primary-badge">{t("productPhotoPrimary")}</span>
                  ) : (
                    <button
                      type="button"
                      className="product-photo-primary-btn"
                      onClick={() => setPendingPrimaryId(photo.id)}
                      disabled={saving}
                    >
                      {t("productPhotoSetPrimary")}
                    </button>
                  )}
                  <button
                    type="button"
                    className="product-photo-remove"
                    aria-label={t("removeAttachment")}
                    onClick={() => handleRemoveExistingPhoto(photo.id)}
                    disabled={saving}
                  >
                    ×
                  </button>
                </div>
              ))}

              {newPreviews.map((preview, i) => (
                <div key={preview} className="product-photo-cell">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="" className="product-preview-img" />
                  <button
                    type="button"
                    className="product-photo-remove"
                    aria-label={t("removeAttachment")}
                    onClick={() => handleRemoveNewPhoto(i)}
                    disabled={saving}
                  >
                    ×
                  </button>
                </div>
              ))}

              {photoCount < MAX_PRODUCT_PHOTOS && (
                <button
                  type="button"
                  className="product-photo-add"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={saving}
                >
                  <CameraIcon size={20} />
                  <span>{t("productPhotoUpload")}</span>
                </button>
              )}
            </div>

            <p className="product-photo-hint meta">
              {t("productPhotoHint", { count: String(photoCount), max: String(MAX_PRODUCT_PHOTOS) })}
            </p>
          </div>

          {/* 3. Collapsible: Feeding & Ingredients */}
          <div className="product-form-section">
            <button
              type="button"
              className="product-section-toggle"
              onClick={() => setShowFeeding((prev) => !prev)}
            >
              <span>{t("productSectionFeeding")}</span>
              <span className="section-arrow">
                {showFeeding ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
              </span>
            </button>

            {showFeeding && (
              <div className="product-section-content">
                <div className="field-group">
                  <label className="field-label" htmlFor="prod-dosage">
                    {t("productDosageLabel")}
                  </label>
                  <input
                    id="prod-dosage"
                    type="text"
                    className="text-input"
                    placeholder={t("productDosagePlaceholder")}
                    value={dosage}
                    onChange={(e) => setDosage(e.target.value)}
                    disabled={saving}
                  />
                </div>

                {showFormDetails && (
                  <div className="field-group">
                    <label className="field-label" htmlFor="prod-main-ingredients">
                      {t("productMainIngredientsLabel")}
                    </label>
                    <input
                      id="prod-main-ingredients"
                      type="text"
                      className="text-input"
                      placeholder={t("productMainIngredientsPlaceholder")}
                      value={mainIngredients}
                      onChange={(e) => setMainIngredients(e.target.value)}
                      disabled={saving}
                    />
                  </div>
                )}

                <div className="field-group">
                  <label className="field-label" htmlFor="prod-ingredients">
                    {t("productIngredientsLabel")}
                  </label>
                  <textarea
                    id="prod-ingredients"
                    className="text-input textarea"
                    rows={3}
                    placeholder={t("productIngredientsPlaceholder")}
                    value={ingredients}
                    onChange={(e) => setIngredients(e.target.value)}
                    disabled={saving}
                  />
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="prod-palatability">
                    {t("productPalatabilityLabel")}
                  </label>
                  <select
                    id="prod-palatability"
                    className="select-input"
                    value={palatability}
                    onChange={(e) => setPalatability(e.target.value as Palatability | "")}
                    disabled={saving}
                  >
                    <option value="">{t("statusUnset")}</option>
                    <option value="HIGH">{t("productPalatabilityHigh")}</option>
                    <option value="MEDIUM">{t("productPalatabilityMedium")}</option>
                    <option value="LOW">{t("productPalatabilityLow")}</option>
                  </select>
                </div>

                <div className="field-group">
                  <label className="field-label">{t("productAdverseReactionsLabel")}</label>
                  <div className="product-adverse-input-row">
                    <input
                      type="text"
                      className="text-input flex-1"
                      placeholder={t("productAdverseReactionPlaceholder")}
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                      disabled={saving}
                    />
                    <button
                      type="button"
                      className="secondary small"
                      onClick={handleAddTag}
                      disabled={saving || !newTagInput.trim()}
                    >
                      {t("productAddTag")}
                    </button>
                  </div>
                  {adverseReactions.length > 0 && (
                    <div className="product-adverse-chips-edit">
                      {adverseReactions.map((tag) => (
                        <span key={tag} className="product-adverse-chip-edit">
                          {tag}
                          <button
                            type="button"
                            className="chip-remove-btn"
                            onClick={() => handleRemoveTag(tag)}
                            aria-label={`Remove ${tag}`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 4. Collapsible: Dates & Storage */}
          <div className="product-form-section">
            <button
              type="button"
              className="product-section-toggle"
              onClick={() => setShowDates((prev) => !prev)}
            >
              <span>{t("productSectionDates")}</span>
              <span className="section-arrow">
                {showDates ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
              </span>
            </button>

            {showDates && (
              <div className="product-section-content">
                <div className="field-group">
                  <label className="field-label" htmlFor="prod-expiry">
                    {t("productExpiryDateLabel")}
                  </label>
                  <input
                    id="prod-expiry"
                    type="date"
                    className="text-input"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    disabled={saving}
                  />
                </div>

                <div className="field-group">
                  <div className="label-with-action">
                    <label className="field-label" htmlFor="prod-opened">
                      {t("productOpenedAtLabel")}
                    </label>
                    <button
                      type="button"
                      className="text-btn small product-opened-today-btn"
                      onClick={handleMarkOpenedToday}
                      disabled={saving}
                    >
                      <CalendarIcon size={13} />
                      <span>{t("productOpenedToday")}</span>
                    </button>
                  </div>
                  <input
                    id="prod-opened"
                    type="date"
                    className="text-input"
                    value={openedAt}
                    onChange={(e) => setOpenedAt(e.target.value)}
                    disabled={saving}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 5. Collapsible: Purchase & Cost */}
          <div className="product-form-section">
            <button
              type="button"
              className="product-section-toggle"
              onClick={() => setShowPurchase((prev) => !prev)}
            >
              <span>{t("productSectionPurchase")}</span>
              <span className="section-arrow">
                {showPurchase ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
              </span>
            </button>

            {showPurchase && (
              <div className="product-section-content">
                {showFormDetails && (
                  <>
                    <div className="field-row">
                      <div className="field-group flex-1">
                        <label className="field-label" htmlFor="prod-form">
                          {t("productFormLabel")}
                        </label>
                        <select
                          id="prod-form"
                          className="select-input"
                          value={form}
                          onChange={(e) => setForm(e.target.value as ProductForm | "")}
                          disabled={saving}
                        >
                          <option value="">{t("statusUnset")}</option>
                          <option value="DRY">{t("productFormDry")}</option>
                          <option value="WET">{t("productFormWet")}</option>
                          <option value="SEMI_MOIST">{t("productFormSemiMoist")}</option>
                          <option value="POWDER">{t("productFormPowder")}</option>
                          <option value="CAPSULE">{t("productFormCapsule")}</option>
                          <option value="TABLET">{t("productFormTablet")}</option>
                          <option value="LIQUID">{t("productFormLiquid")}</option>
                        </select>
                      </div>
                      {/* 알갱이 크기는 건식에만 있는 개념이다 — 습식을 고르면 칸 자체를 숨긴다 */}
                      {form === "DRY" && (
                        <div className="field-group flex-1">
                          <label className="field-label" htmlFor="prod-kibble-size">
                            {t("productKibbleSizeLabel")}
                          </label>
                          <select
                            id="prod-kibble-size"
                            className="select-input"
                            value={kibbleSize}
                            onChange={(e) => setKibbleSize(e.target.value as KibbleSize | "")}
                            disabled={saving}
                          >
                            <option value="">{t("statusUnset")}</option>
                            <option value="SMALL">{t("productKibbleSizeSmall")}</option>
                            <option value="MEDIUM">{t("productKibbleSizeMedium")}</option>
                            <option value="LARGE">{t("productKibbleSizeLarge")}</option>
                          </select>
                        </div>
                      )}
                    </div>

                    <div className="field-row">
                      <div className="field-group flex-1">
                        <label className="field-label" htmlFor="prod-origin">
                          {t("productOriginLabel")}
                        </label>
                        <input
                          id="prod-origin"
                          type="text"
                          className="text-input"
                          placeholder={t("productOriginPlaceholder")}
                          value={origin}
                          onChange={(e) => setOrigin(e.target.value)}
                          disabled={saving}
                        />
                      </div>
                      <div className="field-group flex-1">
                        <label className="field-label" htmlFor="prod-weight">
                          {t("productWeightLabel")}
                        </label>
                        <div className="product-weight-row">
                          <input
                            id="prod-weight"
                            type="text"
                            inputMode="decimal"
                            className="text-input flex-1"
                            placeholder="2"
                            value={weight}
                            onChange={(e) => setWeight(e.target.value)}
                            disabled={saving}
                          />
                          <select
                            className="select-input product-weight-unit"
                            aria-label={t("productWeightLabel")}
                            value={weightUnit}
                            onChange={(e) => setWeightUnit(e.target.value as "kg" | "g")}
                            disabled={saving}
                          >
                            <option value="kg">{t("productWeightUnitKg")}</option>
                            <option value="g">{t("productWeightUnitG")}</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <div className="field-row">
                  <div className="field-group flex-1">
                    <label className="field-label" htmlFor="prod-cost">
                      {t("productCostLabel")}
                    </label>
                    <input
                      id="prod-cost"
                      type="number"
                      min="0"
                      className="text-input"
                      placeholder="35000"
                      value={costKrw}
                      onChange={(e) => setCostKrw(e.target.value)}
                      disabled={saving}
                    />
                  </div>

                  <div className="field-group flex-1">
                    <label className="field-label" htmlFor="prod-purchasedate">
                      {t("productPurchaseDateLabel")}
                    </label>
                    <input
                      id="prod-purchasedate"
                      type="date"
                      className="text-input"
                      value={purchaseDate}
                      onChange={(e) => setPurchaseDate(e.target.value)}
                      disabled={saving}
                    />
                  </div>
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="prod-url">
                    {t("productPurchaseUrlLabel")}
                  </label>
                  <input
                    id="prod-url"
                    type="url"
                    className="text-input"
                    placeholder={t("productPurchaseUrlPlaceholder")}
                    value={purchaseUrl}
                    onChange={(e) => setPurchaseUrl(e.target.value)}
                    disabled={saving}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 6. Notes */}
          <div className="field-group">
            <label className="field-label" htmlFor="prod-notes">
              {t("productNotesLabel")}
            </label>
            <input
              id="prod-notes"
              type="text"
              className="text-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={saving}
            />
          </div>

          {/* Archive button in edit mode */}
          {mode === "edit" && product && (
            <button
              type="button"
              className="button danger product-archive-btn"
              onClick={() => void handleArchive()}
              disabled={saving}
            >
              {t("delete")} / {t("productStatusArchived")}
            </button>
          )}

          {/* Actions */}
          <div className="sheet-actions">
            <button type="button" className="secondary" onClick={onClose} disabled={saving}>
              {t("cancel")}
            </button>
            <button type="submit" className="primary" disabled={saving}>
              {saving ? t("saving") : t("productSaveBtn")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
