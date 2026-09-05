"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiJson } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useLocale } from "../../lib/i18n/locale-context";
import { useToast } from "../../lib/toast-context";
import type { Pet, Product, ProductCategory } from "../../lib/types";
import { ProductPhoto } from "../../components/ProductPhoto";
import { ProductDetailSheet } from "../../components/ProductDetailSheet";
import { ProductEditSheet } from "../../components/ProductEditSheet";

export default function ProductsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { t } = useLocale();
  const { show } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [tab, setTab] = useState<"active" | "archived">("active");

  // Modals
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editSheet, setEditSheet] = useState<
    { mode: "add" } | { mode: "edit"; product: Product } | null
  >(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  const loadData = useCallback(async () => {
    setDataLoading(true);
    try {
      const qs = tab === "archived" ? "?archived=true" : "";
      const [prods, petRows] = await Promise.all([
        apiJson<Product[]>(`/api/products${qs}`),
        apiJson<Pet[]>("/api/pets"),
      ]);
      setProducts(prods);
      setPets(petRows);
    } catch {
      show(t("connectionError"), "error");
    } finally {
      setDataLoading(false);
    }
  }, [tab, show, t]);

  useEffect(() => {
    if (user) void loadData();
  }, [user, loadData]);

  async function handleToggleActive(e: React.MouseEvent, product: Product) {
    e.stopPropagation();
    try {
      await apiJson(`/api/products/${product.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !product.isActive }),
      });
      show(t("productSavedToast"), "success");
      void loadData();
    } catch {
      show(t("saveError"), "error");
    }
  }

  // Filter products by category & tab
  const filteredProducts = products.filter((p) => {
    if (tab === "active" && !p.isActive) return false;
    if (categoryFilter !== "ALL" && p.category !== categoryFilter) return false;
    return true;
  });

  const categories: { key: string; label: string }[] = [
    { key: "ALL", label: t("productCategoryAll") },
    { key: "MEAL", label: t("productCategoryMeal") },
    { key: "SUPPLEMENT", label: t("productCategorySupplement") },
    { key: "TREAT", label: t("productCategoryTreat") },
    { key: "HYGIENE", label: t("productCategoryHygiene") },
    { key: "DEVICE", label: t("productCategoryDevice") },
    { key: "OTHER", label: t("productCategoryOther") },
  ];

  function getDdayBadge(expiryIso: string | null) {
    if (!expiryIso) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const exp = new Date(expiryIso);
    exp.setHours(0, 0, 0, 0);
    const diffDays = Math.round((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { label: t("productDdayExpired"), cls: "dday-expired" };
    if (diffDays === 0) return { label: t("productDdayToday"), cls: "dday-imminent" };
    return {
      label: t("productDdayDays", { days: String(diffDays) }),
      cls: diffDays <= 30 ? "dday-imminent" : "dday-normal",
    };
  }

  return (
    <main className="container products-page">
      {/* Header */}
      <header className="care-header products-page-header">
        <div className="header-title-row">
          <h1>{t("navProducts")}</h1>
          <button
            type="button"
            className="primary small add-product-btn"
            onClick={() => setEditSheet({ mode: "add" })}
          >
            + {t("productAddBtn")}
          </button>
        </div>

        {/* Tab switch: Active vs Archived */}
        <div className="analytics-period-row" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "active"}
            className={`analytics-period-btn ${tab === "active" ? "analytics-period-btn-active" : ""}`}
            onClick={() => setTab("active")}
          >
            🟢 {t("productTabActive")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "archived"}
            className={`analytics-period-btn ${tab === "archived" ? "analytics-period-btn-active" : ""}`}
            onClick={() => setTab("archived")}
          >
            📦 {t("productTabArchived")}
          </button>
        </div>

        {/* Category horizontal scroll buttons */}
        <div className="product-category-filters" role="group" aria-label="Category filters">
          {categories.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`product-cat-chip ${categoryFilter === c.key ? "product-cat-chip-active" : ""}`}
              onClick={() => setCategoryFilter(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </header>

      {/* Product List */}
      {dataLoading ? (
        <div className="loading-state">{t("loading")}</div>
      ) : filteredProducts.length === 0 ? (
        <div className="card empty-state product-empty-card">
          <p className="empty-title">📦 {t("productEmptyTitle")}</p>
          <p className="empty-desc">{t("productEmptyDesc")}</p>
          <button
            type="button"
            className="primary"
            onClick={() => setEditSheet({ mode: "add" })}
            style={{ marginTop: 12 }}
          >
            + {t("productAddBtn")}
          </button>
        </div>
      ) : (
        <div className="products-grid">
          {filteredProducts.map((p) => {
            const dday = getDdayBadge(p.expiryDate);
            return (
              <div
                key={p.id}
                className="card product-card"
                role="button"
                tabIndex={0}
                onClick={() => {
                  setSelectedProduct(p);
                  setDetailOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedProduct(p);
                    setDetailOpen(true);
                  }
                }}
              >
                <div className="product-card-top">
                  {p.photoPath ? (
                    <div className="product-card-thumb">
                      <ProductPhoto
                        productId={p.id}
                        photoPath={p.photoPath}
                        alt={p.name}
                        className="product-card-img"
                      />
                    </div>
                  ) : (
                    <div className="product-card-thumb product-card-thumb-placeholder">
                      {p.category === "MEAL"
                        ? "🥣"
                        : p.category === "SUPPLEMENT"
                          ? "💊"
                          : p.category === "TREAT"
                            ? "🍖"
                            : p.category === "DEVICE"
                              ? "⚙️"
                              : "📦"}
                    </div>
                  )}

                  <div className="product-card-info">
                    <div className="product-card-badge-row">
                      <span className="product-category-badge small">
                        {categories.find((c) => c.key === p.category)?.label ?? p.category}
                      </span>
                      {dday && (
                        <span className={`product-dday-badge ${dday.cls} small`}>
                          {dday.label}
                        </span>
                      )}
                      {p.pet && <span className="product-pet-badge small">{p.pet.name}</span>}
                    </div>

                    {p.brand && <div className="product-card-brand">{p.brand}</div>}
                    <h3 className="product-card-name">{p.name}</h3>

                    {p.dosage && (
                      <p className="product-card-dosage-hint">💡 {p.dosage}</p>
                    )}
                  </div>
                </div>

                {/* Card footer: price, tags, and quick toggle */}
                <div className="product-card-bottom" onClick={(e) => e.stopPropagation()}>
                  <div className="product-card-meta-left">
                    {p.costKrw != null && (
                      <span className="product-card-cost">
                        {p.costKrw.toLocaleString()}
                        {t("eventDetailCostUnit")}
                      </span>
                    )}
                    {p.adverseReactions && p.adverseReactions.length > 0 && (
                      <span className="product-warning-dot" title="Adverse reactions recorded">
                        ⚠️
                      </span>
                    )}
                  </div>

                  <div className="product-card-actions">
                    <button
                      type="button"
                      className={`small button toggle-btn ${p.isActive ? "active" : "inactive"}`}
                      onClick={(e) => void handleToggleActive(e, p)}
                    >
                      {p.isActive ? `🟢 ${t("productStatusActive")}` : `⚪ ${t("productStatusInactive")}`}
                    </button>
                    <button
                      type="button"
                      className="small button secondary"
                      onClick={() => setEditSheet({ mode: "edit", product: p })}
                    >
                      {t("edit")}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Popups */}
      <ProductDetailSheet
        open={detailOpen}
        product={selectedProduct}
        onClose={() => {
          setDetailOpen(false);
          setSelectedProduct(null);
        }}
        onEdit={(prod) => setEditSheet({ mode: "edit", product: prod })}
      />

      {editSheet && (
        <ProductEditSheet
          open={Boolean(editSheet)}
          mode={editSheet.mode}
          product={editSheet.mode === "edit" ? editSheet.product : null}
          pets={pets}
          onClose={() => setEditSheet(null)}
          onSaved={() => void loadData()}
          onArchived={() => void loadData()}
          showToast={show}
        />
      )}
    </main>
  );
}
