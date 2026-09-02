"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiJson } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../lib/toast-context";
import { useLocale } from "../../lib/i18n/locale-context";
import { ThemeToggle } from "../../components/ThemeToggle";
import { AccentColorToggle } from "../../components/AccentColorToggle";
import { LanguageToggle } from "../../components/LanguageToggle";
import { PushNotificationSettings } from "../../components/PushNotificationSettings";
import { MapProviderSettings } from "../../components/MapProviderSettings";

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading, isAdmin, logout, logoutAll } = useAuth();
  const { show } = useToast();
  const { t } = useLocale();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) {
      show(t("passwordMismatchError"), "error");
      return;
    }
    setChangingPassword(true);
    try {
      await apiJson("/api/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      show(t("passwordChangedReLoginToast"), "success");
      await logout();
    } catch (err: unknown) {
      show(t("passwordChangeFailToast", { msg: err instanceof Error ? err.message : String(err) }), "error");
    } finally {
      setChangingPassword(false);
    }
  }

  if (loading || !user) return null;

  return (
    <main className="container settings-page">
      <h1>{t("settingsLabel")}</h1>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t("myAccountTitle")}</h2>
        <p className="meta">
          {user.name} ({user.email}) · {user.role === "ADMIN" ? t("roleAdmin") : t("roleGeneral")}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" className="secondary" onClick={() => void logout()}>
            {t("logoutButton")}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              if (!confirm(t("confirmLogoutAll"))) return;
              void logoutAll();
            }}
          >
            {t("logoutAllButton")}
          </button>
        </div>

        <h3 style={{ marginBottom: 8 }}>{t("changePasswordTitle")}</h3>
        <form onSubmit={handleChangePassword} className="form">
          <input
            type="password"
            placeholder={t("currentPasswordPlaceholder")}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder={t("newPasswordPlaceholder")}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            required
          />
          <input
            type="password"
            placeholder={t("confirmNewPasswordPlaceholder")}
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
            minLength={8}
            required
          />
          <button type="submit" className="secondary" disabled={changingPassword}>
            {changingPassword ? t("processingLabel") : t("changePasswordButton")}
          </button>
        </form>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t("screenTitle")}</h2>
        <p className="meta" style={{ marginTop: 0 }}>
          {t("themeLabel")}
        </p>
        <ThemeToggle />
        <p className="meta" style={{ marginTop: 12 }}>
          {t("accentColorLabel")}
        </p>
        <AccentColorToggle />
        <p className="meta" style={{ marginTop: 12 }}>
          {t("languageLabel")}
        </p>
        <LanguageToggle />
      </div>

      <PushNotificationSettings isAdmin={isAdmin} />

      {isAdmin && <MapProviderSettings />}
    </main>
  );
}
