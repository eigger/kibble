"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import { apiJson } from "../lib/api";
import { formatApiErrorMessage } from "../lib/apiErrorMessage";
import { useLocale } from "../lib/i18n/locale-context";
import type { TranslationKey } from "../lib/i18n/translations";
import { useToast } from "../lib/toast-context";
import type {
  EventTypeAliasesRow,
  PresetDetail,
  Product,
  ProductCategory,
  Routine,
} from "../lib/types";

interface RoutineEditSheetProps {
  open: boolean;
  petId: string;
  /** null이면 새 루틴 */
  routine: Routine | null;
  /** 이 반려동물의 칩 — 숨긴 것 포함. 투약은 호출 쪽에서 뺀다 */
  presets: PresetDetail[];
  eventTypes: EventTypeAliasesRow[];
  products: Product[];
  onClose: () => void;
  onSaved: (routine: Routine) => void;
}

interface ItemDraft {
  key: string;
  presetId: string;
  quantity: string;
  unit: string;
  productId: string;
}

const CATEGORY_LABEL_KEY: Record<ProductCategory, TranslationKey> = {
  MEAL: "productCategoryMeal",
  SUPPLEMENT: "productCategorySupplement",
  MEDICATION: "productCategoryMedication",
  TREAT: "productCategoryTreat",
  HYGIENE: "productCategoryHygiene",
  DEVICE: "productCategoryDevice",
  OTHER: "productCategoryOther",
};

const CATEGORY_ORDER: ProductCategory[] = [
  "MEAL",
  "SUPPLEMENT",
  "TREAT",
  "MEDICATION",
  "HYGIENE",
  "DEVICE",
  "OTHER",
];

function newKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** 칩에 단위가 있으면 그것, 없으면 타입 기본 단위 */
function unitForPreset(
  preset: PresetDetail | undefined,
  defaultUnitByKey: Map<string, string | null>,
): string {
  if (!preset) return "";
  return preset.unit ?? defaultUnitByKey.get(preset.eventType.key) ?? "";
}

function draftsFromRoutine(
  routine: Routine | null,
  presets: PresetDetail[],
  defaultUnitByKey: Map<string, string | null>,
): ItemDraft[] {
  if (!routine) {
    const first = presets[0];
    return [
      {
        key: newKey(),
        presetId: first?.id ?? "",
        quantity: "",
        unit: unitForPreset(first, defaultUnitByKey),
        productId: "",
      },
    ];
  }
  return routine.items.map((item) => ({
    key: newKey(),
    // 칩이 없어졌으면(보관) 같은 타입의 칩으로 되돌린다
    presetId:
      item.presetId ?? presets.find((p) => p.eventTypeId === item.eventTypeId)?.id ?? "",
    quantity: item.quantity != null ? String(item.quantity) : "",
    unit: item.unit ?? "",
    productId: item.productId ?? "",
  }));
}

/** 루틴 정의 시트 — 이름 + 항목(칩·제품·양·단위) 목록 (§7.24) */
export function RoutineEditSheet({
  open,
  petId,
  routine,
  presets,
  eventTypes,
  products,
  onClose,
  onSaved,
}: RoutineEditSheetProps) {
  const { t, tLabel, locale } = useLocale();
  const { show } = useToast();
  const [label, setLabel] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [saving, setSaving] = useState(false);

  const defaultUnitByKey = useMemo(
    () => new Map(eventTypes.map((et) => [et.key, et.defaultUnit ?? null])),
    [eventTypes],
  );
  const presetById = useMemo(() => new Map(presets.map((p) => [p.id, p])), [presets]);

  const productGroups = useMemo(() => {
    const groups = new Map<ProductCategory, Product[]>();
    for (const product of products) {
      const list = groups.get(product.category) ?? [];
      list.push(product);
      groups.set(product.category, list);
    }
    return CATEGORY_ORDER.filter((c) => groups.has(c)).map((c) => ({
      category: c,
      products: groups.get(c)!,
    }));
  }, [products]);

  useEffect(() => {
    if (!open) return;
    setLabel(routine?.label ?? "");
    setItems(draftsFromRoutine(routine, presets, defaultUnitByKey));
    setSaving(false);
  }, [open, routine, presets, defaultUnitByKey]);

  if (!open) return null;

  const title = routine ? t("routineEditTitle") : t("routineNewTitle");

  function updateItem(key: string, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }

  function changePreset(key: string, presetId: string) {
    updateItem(key, { presetId, unit: unitForPreset(presetById.get(presetId), defaultUnitByKey) });
  }

  function addItem() {
    const last = items[items.length - 1];
    const first = presets[0];
    setItems((prev) => [
      ...prev,
      {
        key: newKey(),
        presetId: last?.presetId ?? first?.id ?? "",
        quantity: "",
        unit: last ? last.unit : unitForPreset(first, defaultUnitByKey),
        productId: "",
      },
    ]);
  }

  function removeItem(key: string) {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((it) => it.key !== key)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const name = label.trim();
    if (!name) return;

    const payloadItems = items
      .map((it) => {
        const preset = presetById.get(it.presetId);
        if (!preset) return null;
        const quantityRaw = it.quantity.trim();
        const quantity = quantityRaw ? Number(quantityRaw) : null;
        return {
          eventTypeId: preset.eventTypeId,
          presetId: preset.id,
          productId: it.productId || null,
          quantity: quantity != null && Number.isFinite(quantity) ? quantity : null,
          unit: it.unit.trim() || null,
        };
      })
      .filter((v): v is NonNullable<typeof v> => v != null);
    if (payloadItems.length === 0) return;

    setSaving(true);
    try {
      const saved = routine
        ? await apiJson<Routine>(`/api/routines/${routine.id}`, {
            method: "PATCH",
            body: JSON.stringify({ label: name, items: payloadItems }),
          })
        : await apiJson<Routine>("/api/routines", {
            method: "POST",
            body: JSON.stringify({ petId, label: name, items: payloadItems }),
          });
      show(t("routinesSavedToast"), "success");
      onSaved(saved);
    } catch (err) {
      show(formatApiErrorMessage(err, t("saveError"), locale), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="sheet-backdrop" role="presentation" onClick={saving ? undefined : onClose}>
      <div
        className="sheet-card routine-edit-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <h2 className="product-sheet-title">{title}</h2>

        <form onSubmit={(e) => void handleSubmit(e)} className="product-sheet-form">
          <div className="field-group">
            <label className="field-label" htmlFor="routine-label">
              {t("routineLabelField")} <span className="required">*</span>
            </label>
            <input
              id="routine-label"
              type="text"
              className="text-input"
              required
              maxLength={100}
              placeholder={t("routineLabelPlaceholder")}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={saving}
            />
          </div>

          <p className="field-label routine-items-heading">{t("routineItemsLabel")}</p>
          <p className="meta routine-items-hint">{t("routineItemsHint")}</p>

          <ul className="routine-item-list">
            {items.map((item, index) => (
              <li key={item.key} className="routine-item-row">
                <div className="field-row">
                  <div className="field-group flex-1">
                    <label className="field-label" htmlFor={`routine-item-type-${index}`}>
                      {t("routineItemType")}
                    </label>
                    <select
                      id={`routine-item-type-${index}`}
                      className="select-input"
                      value={item.presetId}
                      onChange={(e) => changePreset(item.key, e.target.value)}
                      disabled={saving}
                    >
                      {presets.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {tLabel(preset.label)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field-group flex-1">
                    <label className="field-label" htmlFor={`routine-item-product-${index}`}>
                      {t("routineItemProduct")}
                    </label>
                    <select
                      id={`routine-item-product-${index}`}
                      className="select-input"
                      value={item.productId}
                      onChange={(e) => updateItem(item.key, { productId: e.target.value })}
                      disabled={saving}
                    >
                      <option value="">{t("routineItemProductNone")}</option>
                      {productGroups.map((group) => (
                        <optgroup key={group.category} label={t(CATEGORY_LABEL_KEY[group.category])}>
                          {group.products.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="field-row routine-item-amount-row">
                  <div className="field-group flex-1">
                    <label className="field-label" htmlFor={`routine-item-qty-${index}`}>
                      {t("routineItemQuantity")}
                    </label>
                    <input
                      id={`routine-item-qty-${index}`}
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min={0}
                      className="text-input"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.key, { quantity: e.target.value })}
                      disabled={saving}
                    />
                  </div>
                  <div className="field-group routine-item-unit">
                    <label className="field-label" htmlFor={`routine-item-unit-${index}`}>
                      {t("routineItemUnit")}
                    </label>
                    <input
                      id={`routine-item-unit-${index}`}
                      type="text"
                      className="text-input"
                      maxLength={32}
                      value={item.unit}
                      onChange={(e) => updateItem(item.key, { unit: e.target.value })}
                      disabled={saving}
                    />
                  </div>
                  <button
                    type="button"
                    className="secondary small routine-item-remove"
                    onClick={() => removeItem(item.key)}
                    disabled={saving || items.length <= 1}
                    aria-label={t("remove")}
                  >
                    {t("remove")}
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="secondary small routine-add-item"
            onClick={addItem}
            disabled={saving || presets.length === 0 || items.length >= 20}
          >
            + {t("routineAddItem")}
          </button>

          <div className="form-actions">
            <button type="button" className="secondary" onClick={onClose} disabled={saving}>
              {t("cancel")}
            </button>
            <button type="submit" className="primary" disabled={saving || presets.length === 0}>
              {saving ? t("saving") : t("save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
