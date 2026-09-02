"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { MedicationReminderPrefs } from "@kibble/shared";
import { DEFAULT_MEDICATION_REMINDER_PREFS } from "@kibble/shared";
import { useLocale } from "../lib/i18n/locale-context";
import { useToast } from "../lib/toast-context";
import {
  fetchMedicationReminderPrefs,
  fetchPushStatus,
  saveMedicationReminderPrefs,
  sendTestPush,
  subscribeToPush,
  unsubscribeFromPush,
  type PushStatus,
} from "../lib/pushNotifications";

type Props = {
  isAdmin: boolean;
};

export function PushNotificationSettings({ isAdmin }: Props) {
  const { t, locale } = useLocale();
  const { show } = useToast();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [prefs, setPrefs] = useState<MedicationReminderPrefs>(DEFAULT_MEDICATION_REMINDER_PREFS);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [testing, setTesting] = useState(false);

  const refresh = useCallback(async () => {
    const [pushStatus, reminderPrefs] = await Promise.all([
      fetchPushStatus(),
      fetchMedicationReminderPrefs().catch(() => DEFAULT_MEDICATION_REMINDER_PREFS),
    ]);
    setStatus(pushStatus);
    setPrefs(reminderPrefs);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleSubscribe() {
    setSubscribing(true);
    try {
      await subscribeToPush(locale);
      show(t("pushSubscribedToast"), "success");
      await refresh();
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : "";
      if (code === "unsupported") show(t("pushNotSupported"), "error");
      else if (code === "denied") show(t("pushPermissionDenied"), "error");
      else show(t("pushSubscribeFailToast", { msg: code || String(err) }), "error");
    } finally {
      setSubscribing(false);
    }
  }

  async function handleUnsubscribe() {
    setSubscribing(true);
    try {
      await unsubscribeFromPush();
      show(t("pushUnsubscribedToast"), "success");
      await refresh();
    } catch (err: unknown) {
      show(t("pushSubscribeFailToast", { msg: err instanceof Error ? err.message : String(err) }), "error");
    } finally {
      setSubscribing(false);
    }
  }

  async function handleSavePrefs() {
    setSavingPrefs(true);
    try {
      const saved = await saveMedicationReminderPrefs(prefs);
      setPrefs(saved);
      show(t("medicationReminderSavedToast"), "success");
    } catch (err: unknown) {
      show(t("pushSubscribeFailToast", { msg: err instanceof Error ? err.message : String(err) }), "error");
    } finally {
      setSavingPrefs(false);
    }
  }

  async function handleTestPush() {
    setTesting(true);
    try {
      await sendTestPush();
      show(t("pushTestSentToast"), "success");
    } catch (err: unknown) {
      show(t("pushSubscribeFailToast", { msg: err instanceof Error ? err.message : String(err) }), "error");
    } finally {
      setTesting(false);
    }
  }

  if (loading || !status) return null;

  const subscribed = status.subscriptionCount > 0;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>{t("pushNotificationsTitle")}</h2>
      <p className="meta">{t("pushNotificationsHint")}</p>

      {isAdmin && !status.configured && (
        <div style={{ marginBottom: 12 }}>
          {/* 키 발급은 연동 화면 한 곳에서만 한다 — 두 군데서 만들면 어디서 고칠지가 갈린다 */}
          <p className="meta">{t("pushNotConfiguredHint")}</p>
          <Link className="integration-link" href="/integrations">
            {t("pushConfigureLink")}
          </Link>
        </div>
      )}

      <p className="meta">
        {status.configured ? t("pushServerConfigured") : t("pushServerNotConfigured")}
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {subscribed ? (
          <button type="button" className="secondary" disabled={subscribing} onClick={() => void handleUnsubscribe()}>
            {subscribing ? t("processingLabel") : t("pushUnsubscribeButton")}
          </button>
        ) : (
          <button
            type="button"
            disabled={!status.configured || subscribing}
            onClick={() => void handleSubscribe()}
          >
            {subscribing ? t("processingLabel") : t("pushSubscribeButton")}
          </button>
        )}
        <button
          type="button"
          className="secondary"
          disabled={!subscribed || testing}
          onClick={() => void handleTestPush()}
        >
          {testing ? t("processingLabel") : t("pushTestButton")}
        </button>
      </div>

      <h3 style={{ marginBottom: 8 }}>{t("medicationReminderTitle")}</h3>
      <p className="meta" style={{ marginTop: 0 }}>
        {t("medicationReminderHint")}
      </p>
      <div className="form">
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={prefs.enabled}
            onChange={(e) => setPrefs((p) => ({ ...p, enabled: e.target.checked }))}
          />
          {t("medicationReminderEnabled")}
        </label>
        <label>
          {t("medicationReminderLeadMinutes")}
          <input
            type="number"
            min={0}
            max={120}
            value={prefs.leadMinutes}
            onChange={(e) => setPrefs((p) => ({ ...p, leadMinutes: Number(e.target.value) }))}
          />
        </label>
        <label>
          {t("medicationReminderOverdueMinutes")}
          <input
            type="number"
            min={0}
            max={180}
            value={prefs.overdueMinutes}
            onChange={(e) => setPrefs((p) => ({ ...p, overdueMinutes: Number(e.target.value) }))}
          />
        </label>
        <button type="button" className="secondary" disabled={savingPrefs} onClick={() => void handleSavePrefs()}>
          {savingPrefs ? t("processingLabel") : t("save")}
        </button>
      </div>
    </div>
  );
}
