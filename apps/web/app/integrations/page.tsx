"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { SettingEntry, SettingKey } from "@kibble/shared";
import { apiJson } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useLocale } from "../../lib/i18n/locale-context";
import { useToast } from "../../lib/toast-context";
import { fetchPushStatus, generateVapidKeys, type PushStatus } from "../../lib/pushNotifications";

import type { TranslationKey } from "../../lib/i18n/translations";

// 새 연동을 추가할 때는 shared의 settingKeySchema와 여기 매핑만 늘리면 된다.
const SETTING_META: Partial<
  Record<
    string,
    {
      labelKey: TranslationKey;
      helpKey: TranslationKey;
      signupUrl?: string;
      signupLabelKey?: TranslationKey;
      placeholderKey?: TranslationKey;
    }
  >
> = {
  KAKAO_MAP_APP_KEY: {
    labelKey: "kakaoMapAppKeyLabel",
    helpKey: "kakaoMapAppKeyHelp",
    signupUrl: "https://developers.kakao.com/console/app",
    signupLabelKey: "integrationLinkKakao",
    placeholderKey: "kakaoKeyPlaceholder",
  },
  VAPID_SUBJECT: {
    labelKey: "vapidSubjectLabel",
    helpKey: "vapidSubjectHelp",
    placeholderKey: "vapidSubjectPlaceholder",
  },
  APP_PUBLIC_URL: {
    labelKey: "appPublicUrlLabel",
    helpKey: "appPublicUrlHelp",
    placeholderKey: "appPublicUrlPlaceholder",
  },
};

const GROUPS: { key: string; titleKey: TranslationKey; keys: SettingKey[] }[] = [
  { key: "map", titleKey: "integrationGroupMap", keys: ["KAKAO_MAP_APP_KEY"] },
  { key: "notification", titleKey: "integrationGroupNotification", keys: ["VAPID_PUBLIC_KEY", "VAPID_SUBJECT"] },
  { key: "server", titleKey: "integrationGroupServer", keys: ["APP_PUBLIC_URL"] },
];

export default function IntegrationsPage() {
  const router = useRouter();
  const { user, loading: authLoading, isAdmin } = useAuth();
  const { t } = useLocale();
  const [settings, setSettings] = useState<SettingEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) router.replace("/login");
    else if (!isAdmin) router.replace("/settings");
  }, [authLoading, user, isAdmin, router]);

  const load = useCallback(async () => {
    try {
      setSettings(await apiJson<SettingEntry[]>("/api/settings"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && isAdmin) void load();
  }, [user, isAdmin, load]);

  if (authLoading || !user || !isAdmin) return null;
  if (loading) return <main className="container"><p className="meta">{t("loading")}</p></main>;

  return (
    <main className="container integrations-page">
      <h1>{t("integrationsHeading")}</h1>
      <p className="meta">{t("integrationsIntro")}</p>

      {GROUPS.map((group) => (
        <section key={group.key} className="integration-group">
          <h2 className="integration-group-title">{t(group.titleKey)}</h2>
          {group.keys.map((key) => {
            if (key === "VAPID_PUBLIC_KEY") {
              return <VapidCard key={key} onChanged={load} />;
            }
            const entry = settings.find((e) => e.key === key);
            if (!entry) return null;
            return <SettingCard key={key} entry={entry} onChanged={load} />;
          })}
        </section>
      ))}
    </main>
  );
}

function SettingCard({ entry, onChanged }: { entry: SettingEntry; onChanged: () => Promise<void> }) {
  const { t } = useLocale();
  const { show } = useToast();
  const meta = SETTING_META[entry.key];
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(entry.value ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(entry.value ?? "");
  }, [entry.value]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await apiJson(`/api/settings/${entry.key}`, {
        method: "PUT",
        body: JSON.stringify({ value: trimmed }),
      });
      show(t("integrationSavedToast"), "success");
      setEditing(false);
      await onChanged();
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    const label = meta?.labelKey ? t(meta.labelKey) : entry.key;
    if (!confirm(t("integrationRemoveConfirm", { name: label }))) return;
    setSaving(true);
    try {
      await apiJson(`/api/settings/${entry.key}`, { method: "DELETE" });
      show(t("integrationRemovedToast"), "success");
      await onChanged();
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card integration-card">
      <div className="integration-card-head">
        <strong>{meta?.labelKey ? t(meta.labelKey) : entry.key}</strong>
        <SourceBadge entry={entry} />
      </div>
      {meta?.helpKey && <p className="meta integration-help">{t(meta.helpKey)}</p>}

      {entry.configured && !editing && (
        <p className="integration-value">{entry.value ?? entry.masked}</p>
      )}

      {editing || !entry.configured ? (
        <form onSubmit={handleSave} className="integration-form">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={meta?.placeholderKey ? t(meta.placeholderKey) : ""}
            autoComplete="off"
            spellCheck={false}
          />
          <div className="integration-actions">
            <button type="submit" className="secondary" disabled={saving || !value.trim()}>
              {saving ? t("saving") : t("save")}
            </button>
            {editing && (
              <button type="button" className="secondary" disabled={saving} onClick={() => setEditing(false)}>
                {t("cancel")}
              </button>
            )}
          </div>
        </form>
      ) : (
        <div className="integration-actions">
          <button type="button" className="secondary" disabled={saving} onClick={() => setEditing(true)}>
            {t("edit")}
          </button>
          {entry.source === "db" && (
            <button type="button" className="secondary" disabled={saving} onClick={() => void handleRemove()}>
              {t("remove")}
            </button>
          )}
        </div>
      )}

      {meta?.signupUrl && (
        <a className="integration-link" href={meta.signupUrl} target="_blank" rel="noopener noreferrer">
          {meta.signupLabelKey ? t(meta.signupLabelKey) : t("integrationLinkGeneric")}
        </a>
      )}
    </div>
  );
}

function SourceBadge({ entry }: { entry: SettingEntry }) {
  const { t } = useLocale();
  if (!entry.configured) {
    return <span className="integration-badge integration-badge-off">{t("statusUnset")}</span>;
  }
  return (
    <span className="integration-badge">
      {entry.source === "env" ? t("integrationSourceEnv") : t("integrationSourceDb")}
    </span>
  );
}

/** VAPID 키 쌍은 손으로 넣지 않는다 — 발급 버튼만 값을 만든다. */
function VapidCard({ onChanged }: { onChanged: () => Promise<void> }) {
  const { t } = useLocale();
  const { show } = useToast();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [generating, setGenerating] = useState(false);

  const refresh = useCallback(async () => {
    setStatus(await fetchPushStatus());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleGenerate() {
    if (status?.configured && !confirm(t("vapidRegenerateConfirm"))) return;
    setGenerating(true);
    try {
      await generateVapidKeys();
      show(t("vapidGeneratedToast"), "success");
      await refresh();
      await onChanged();
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setGenerating(false);
    }
  }

  const configured = status?.configured ?? false;

  return (
    <div className="card integration-card">
      <div className="integration-card-head">
        <strong>{t("vapidHeading")}</strong>
        <span className={`integration-badge ${configured ? "" : "integration-badge-off"}`}>
          {configured ? t("statusSet") : t("statusUnset")}
        </span>
      </div>
      <p className="meta integration-help">{t("vapidHelp")}</p>
      <div className="integration-actions">
        <button type="button" className="secondary" disabled={generating} onClick={() => void handleGenerate()}>
          {generating ? t("processingLabel") : configured ? t("vapidRegenerateButton") : t("generateVapidButton")}
        </button>
      </div>
      {configured && <p className="meta integration-help">{t("vapidRegenerateWarning")}</p>}
    </div>
  );
}
