"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiJson } from "../lib/api";
import { useLocale } from "../lib/i18n/locale-context";
import { useToast } from "../lib/toast-context";

const SETTING_KEY = "KAKAO_MAP_APP_KEY";

type SettingRow = { key: string; hasValue: boolean };

/**
 * 지도 API 키는 각자 발급한다 — 공개 저장소에 키를 넣지 않는다(WORKPLAN §7.2).
 * 키가 없으면 병원 검색·지도·내비 UI가 조용히 숨는다.
 */
export function MapProviderSettings() {
  const { t } = useLocale();
  const { show } = useToast();
  const [hasKey, setHasKey] = useState(false);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    try {
      const rows = await apiJson<SettingRow[]>("/api/settings");
      setHasKey(rows.some((row) => row.key === SETTING_KEY && row.hasValue));
    } catch {
      setHasKey(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await apiJson(`/api/settings/${SETTING_KEY}`, {
        method: "PUT",
        body: JSON.stringify({ value: trimmed }),
      });
      setValue("");
      show(t("kakaoKeySavedToast"), "success");
      await refresh();
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    try {
      await apiJson(`/api/settings/${SETTING_KEY}`, { method: "DELETE" });
      show(t("kakaoKeyClearedToast"), "success");
      await refresh();
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>{t("mapIntegrationTitle")}</h2>
      <p className="meta" style={{ marginTop: 0 }}>
        {t("mapIntegrationHint")}
      </p>
      <p className="meta">
        {t("statusLabel")} {hasKey ? t("statusSet") : t("statusUnset")}
      </p>
      <form onSubmit={handleSave} className="form">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("kakaoKeyPlaceholder")}
          autoComplete="off"
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="submit" className="secondary" disabled={saving || !value.trim()}>
            {saving ? t("saving") : t("save")}
          </button>
          {hasKey && (
            <button type="button" className="secondary" disabled={saving} onClick={() => void handleClear()}>
              {t("remove")}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
