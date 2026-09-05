"use client";

import { useEffect, useState, useRef } from "react";
import type { Pet, Product, ProductCategory, Palatability } from "../lib/types";
import { useLocale } from "../lib/i18n/locale-context";
import { apiJson, apiFetch } from "../lib/api";
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
  const [expiryDate, setExpiryDate] = useState("");
  const [openedAt, setOpenedAt] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [costKrw, setCostKrw] = useState("");
  const [purchaseUrl, setPurchaseUrl] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [palatability, setPalatability] = useState<Palatability | "">("");
  const [adverseReactions, setAdverseReactions] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState("");
  const [notes, setNotes] = useState("");

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
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
      setExpiryDate(product.expiryDate ? product.expiryDate.slice(0, 10) : "");
      setOpenedAt(product.openedAt ? product.openedAt.slice(0, 10) : "");
      setPurchaseDate(product.purchaseDate ? product.purchaseDate.slice(0, 10) : "");
      setCostKrw(product.costKrw != null ? String(product.costKrw) : "");
      setPurchaseUrl(product.purchaseUrl ?? "");
      setIsActive(product.isActive ?? true);
      setPalatability(product.palatability ?? "");
      setAdverseReactions(product.adverseReactions ?? []);
      setNotes(product.notes ?? "");

      // Auto-open sections if they have values
      if (product.dosage || product.ingredients || product.palatability || (product.adverseReactions?.length ?? 0) > 0) {
        setShowFeeding(true);
      }
      if (product.expiryDate || product.openedAt) {
        setShowDates(true);
      }
      if (product.costKrw != null || product.purchaseDate || product.purchaseUrl) {
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
      setExpiryDate("");
      setOpenedAt("");
      setPurchaseDate("");
      setCostKrw("");
      setPurchaseUrl("");
      setIsActive(true);
      setPalatability("");
      setAdverseReactions([]);
      setNotes("");
      setShowFeeding(false);
      setShowDates(false);
      setShowPurchase(false);
    }
    setPhotoFile(null);
    setPhotoPreview(null);
    setNewTagInput("");
  }, [open, mode, product]);

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

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
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
        ingredients: ingredients.trim() || null,
        expiryDate: expiryDate ? new Date(`${expiryDate}T00:00:00.000Z`).toISOString() : null,
        openedAt: openedAt ? new Date(`${openedAt}T00:00:00.000Z`).toISOString() : null,
        purchaseDate: purchaseDate ? new Date(`${purchaseDate}T00:00:00.000Z`).toISOString() : null,
        costKrw: costKrw ? Number(costKrw) : null,
        purchaseUrl: normalizedUrl,
        isActive,
        palatability: palatability || null,
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

      // Upload photo if selected
      if (photoFile && savedId) {
        const formData = new FormData();
        formData.append("file", photoFile);
        await apiFetch(`/api/products/${savedId}/photo`, {
          method: "POST",
          body: formData,
        });
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
            <div className="product-photo-upload-row">
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                accept="image/*"
                onChange={handlePhotoChange}
              />

              <div className="product-photo-thumb-preview">
                {photoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoPreview} alt="Preview" className="product-preview-img" />
                ) : product?.photoPath ? (
                  <ProductPhoto
                    productId={product.id}
                    photoPath={product.photoPath}
                    alt={product.name}
                    className="product-preview-img"
                  />
                ) : (
                  <div className="product-photo-placeholder">
                    <CameraIcon size={24} />
                  </div>
                )}
              </div>

              <div className="product-photo-btn-group">
                <button
                  type="button"
                  className="secondary small"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={saving}
                >
                  {photoPreview || product?.photoPath ? t("productPhotoChange") : t("productPhotoUpload")}
                </button>
                {(photoPreview || product?.photoPath) && (
                  <button
                    type="button"
                    className="secondary small text-muted"
                    onClick={() => {
                      setPhotoFile(null);
                      setPhotoPreview(null);
                    }}
                    disabled={saving}
                  >
                    {t("cancel")}
                  </button>
                )}
              </div>
            </div>
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
