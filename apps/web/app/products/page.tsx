"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { kstDayDiff } from "@kibble/shared";
import { apiJson } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useLocale } from "../../lib/i18n/locale-context";
import { useToast } from "../../lib/toast-context";
import type { Pet, Product } from "../../lib/types";
import { ProductPhoto } from "../../components/ProductPhoto";
import { ProductDetailSheet } from "../../components/ProductDetailSheet";
import { ProductEditSheet } from "../../components/ProductEditSheet";
import {
  PackageIcon,
  RotateCcwIcon,
  AlertCircleIcon,
} from "../../components/ProductIcons";

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
  const [tab, setTab] = useState<"active" | "inactive" | "archived">("active");

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
      let qs = "";
      if (tab === "archived") {
        qs = "?archived=true";
      } else if (tab === "inactive") {
        qs = "?isActive=false";
      } else {
        qs = "?isActive=true";
      }
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

  async function handleRestore(e: React.MouseEvent, product: Product) {
    e.stopPropagation();
    try {
      await apiJson(`/api/products/${product.id}/restore`, { method: "POST" });
      show(t("productRestoredToast"), "success");
      void loadData();
    } catch {
      show(t("saveError"), "error");
    }
  }

  // Filter products by category & tab
  const filteredProducts = products.filter((p) => {
    if (categoryFilter !== "ALL" && p.category !== categoryFilter) return false;
    return true;
  });

  const categories: { key: string; label: string }[] = [
    { key: "ALL", label: t("productCategoryAll") },
    { key: "MEAL", label: t("productCategoryMeal") },
    { key: "SUPPLEMENT", label: t("productCategorySupplement") },
    { key: "MEDICATION", label: t("productCategoryMedication") },
    { key: "TREAT", label: t("productCategoryTreat") },
    { key: "HYGIENE", label: t("productCategoryHygiene") },
    { key: "DEVICE", label: t("productCategoryDevice") },
    { key: "OTHER", label: t("productCategoryOther") },
  ];

  const [nowDate, setNowDate] = useState(() => new Date());

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        setNowDate(new Date());
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  function getDdayBadge(expiryIso: string | null, baseDate = nowDate) {
    if (!expiryIso) return null;
    const diffDays = kstDayDiff(new Date(expiryIso), baseDate);
    if (diffDays < 0) return { label: t("productDdayExpired"), cls: "dday-expired" };
    if (diffDays === 0) return { label: t("productDdayToday"), cls: "dday-imminent" };
    return {
      label: t("productDdayDays", { days: String(diffDays) }),
      cls: diffDays <= 30 ? "dday-imminent" : "dday-normal",
    };
  }

  // Summary stats
  const { activeCount, imminentCount, totalCost } = useMemo(() => {
    let active = 0;
    let imminent = 0;
    let cost = 0;
    for (const p of products) {
      if (p.isActive) active++;
      if (p.costKrw != null) cost += p.costKrw;
      if (p.expiryDate) {
        const diff = kstDayDiff(new Date(p.expiryDate), nowDate);
        if (diff >= 0 && diff <= 30) imminent++;
      }
    }
    return { activeCount: active, imminentCount: imminent, totalCost: cost };
  }, [products, nowDate]);

  return (
    <main className="container sub-page products-page">
      <header className="products-header">
        <div className="products-header-row">
          <div>
            <h1>{t("navProducts")}</h1>
            <p className="meta">{t("productEmptyDesc")}</p>
          </div>
          <button
            type="button"
            className="btn-action primary product-add-btn"
            onClick={() => setEditSheet({ mode: "add" })}
          >
            + {t("productAddBtn")}
          </button>
        </div>

        {/* Summary Bar */}
        <div className="product-summary-bar meta">
          <span className="product-summary-item">
            {t("productStatusActiveShort")} <strong>{activeCount}</strong>
          </span>
          {imminentCount > 0 && (
            <>
              <span className="product-summary-dot">·</span>
              <span className="product-summary-item product-summary-imminent">
                {t("productExpiryImminent")} <strong>{imminentCount}</strong>
              </span>
            </>
          )}
          {totalCost > 0 && (
            <>
              <span className="product-summary-dot">·</span>
              <span className="product-summary-item">
                {t("productTotalCostSum")}{" "}
                <strong>
                  {totalCost.toLocaleString()}
                  {t("eventDetailCostUnit")}
                </strong>
              </span>
            </>
          )}
        </div>

        {/* Tab switcher: active vs inactive vs archived */}
        <div className="product-tabs" role="tablist" aria-label="Product lifecycle">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "active"}
            className={`product-tab${tab === "active" ? " product-tab-active" : ""}`}
            onClick={() => setTab("active")}
          >
            {t("productTabActive")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "inactive"}
            className={`product-tab${tab === "inactive" ? " product-tab-active" : ""}`}
            onClick={() => setTab("inactive")}
          >
            {t("productStatusInactive")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "archived"}
            className={`product-tab${tab === "archived" ? " product-tab-active" : ""}`}
            onClick={() => setTab("archived")}
          >
            {t("productTabArchived")}
          </button>
        </div>

        {/* Category horizontal scroll buttons */}
        <div className="product-category-filters" role="group" aria-label="Category filters">
          {categories.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`product-cat-chip${categoryFilter === c.key ? " product-cat-chip-active" : ""}`}
              onClick={() => setCategoryFilter(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </header>

      {/* Product List */}
      {dataLoading ? (
        <div className="loading-state meta">{t("loading")}</div>
      ) : filteredProducts.length === 0 ? (
        <div className="card empty-state product-empty-card">
          <div className="product-empty-icon">
            <PackageIcon size={32} />
          </div>
          <p className="empty-title">{t("productEmptyTitle")}</p>
          <p className="empty-desc meta">{t("productEmptyDesc")}</p>
          <button
            type="button"
            className="btn-action primary"
            onClick={() => setEditSheet({ mode: "add" })}
            style={{ marginTop: 8 }}
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
                    <div className="product-card-thumb">
                      <PackageIcon size={24} />
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
                      <p className="product-card-dosage-hint">{p.dosage}</p>
                    )}
                  </div>
                </div>

                {/* Card footer: price, tags, and quick toggle */}
                <div className="product-card-bottom" onClick={(e) => e.stopPropagation()}>
                  <div className="product-card-meta-left">
                    {p.mainIngredients && (
                      <span className="product-card-main-ingredients">{p.mainIngredients}</span>
                    )}
                    {p.adverseReactions && p.adverseReactions.length > 0 && (
                      <span className="product-warning-badge" title={t("productAdverseReactionsLabel")}>
                        <AlertCircleIcon size={12} />
                      </span>
                    )}
                  </div>

                  <div className="product-card-actions">
                    {tab === "archived" ? (
                      <button
                        type="button"
                        className="btn-action small"
                        onClick={(e) => void handleRestore(e, p)}
                      >
                        <RotateCcwIcon size={12} />
                        <span>{t("productRestoreBtn")}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={`toggle-btn ${p.isActive ? "active" : "inactive"}`}
                        onClick={(e) => void handleToggleActive(e, p)}
                      >
                        <span className={`status-dot ${p.isActive ? "" : "status-dot-inactive"}`} />
                        <span>{p.isActive ? t("productStatusActiveShort") : t("productStatusInactiveShort")}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-action small"
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
        product={selectedProduct}
        open={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setSelectedProduct(null);
        }}
        onEdit={(p) => setEditSheet({ mode: "edit", product: p })}
      />

      <ProductEditSheet
        open={editSheet !== null}
        mode={editSheet?.mode ?? "add"}
        product={editSheet?.mode === "edit" ? editSheet.product : null}
        pets={pets}
        onClose={() => setEditSheet(null)}
        onSaved={() => void loadData()}
        onArchived={() => void loadData()}
        showToast={show}
      />
    </main>
  );
}
