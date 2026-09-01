"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, apiJson, API_URL } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../lib/toast-context";
import { useLocale } from "../../lib/i18n/locale-context";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { OneTimeSecrets, type OneTimeSecret } from "../../components/OneTimeSecrets";

export default function BackupPage() {
  const router = useRouter();
  const { user, loading, isAdmin } = useAuth();
  const { show } = useToast();
  const { t } = useLocale();
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [pendingRestoreFile, setPendingRestoreFile] = useState<File | null>(null);
  const [recoverySecrets, setRecoverySecrets] = useState<OneTimeSecret[] | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    else if (!loading && user && !isAdmin) router.push("/");
  }, [loading, user, isAdmin, router]);

  async function handleExport() {
    setExporting(true);
    try {
      const { ticket } = await apiJson<{ ticket: string }>("/api/backup/export-ticket", { method: "POST" });
      const a = document.createElement("a");
      a.href = `${API_URL}/api/backup/export?ticket=${encodeURIComponent(ticket)}`;
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setExporting(false);
    }
  }

  function handleRestorePick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPendingRestoreFile(file);
    setRestoreConfirmOpen(true);
  }

  async function confirmRestore() {
    if (!pendingRestoreFile) return;
    const file = pendingRestoreFile;
    setRestoreConfirmOpen(false);
    setPendingRestoreFile(null);
    setRestoring(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await apiFetch("/api/backup/restore", { method: "POST", body: formData });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : t("restoreFailFallback"));

      const recoveries = (body?.recoveryPasswords ?? body?.adminRecoveryPasswords) as
        | { email: string; role?: string; temporaryPassword: string }[]
        | undefined;
      if (recoveries?.length) {
        setRecoverySecrets(
          recoveries.map((r) => ({
            label: `${r.email}${r.role ? ` (${r.role})` : ""}`,
            value: r.temporaryPassword,
          })),
        );
      }
      show(t("restoreSuccessToast"), "success");
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setRestoring(false);
    }
  }

  if (loading || !user || !isAdmin) return null;

  return (
    <main className="container sub-page">
      <h1>{t("backupRestoreTitle")}</h1>

      <div className="card">
        <p className="meta">{t("backupRestoreHint")}</p>
        <p className="meta">{t("backupSecurityHint")}</p>
        <div className="form">
          <button type="button" onClick={() => void handleExport()} disabled={exporting || restoring}>
            {exporting ? t("exportingLabel") : t("exportButton")}
          </button>
          <label>
            {t("restoreLabel")}
            <input
              type="file"
              accept=".tar.gz"
              onChange={handleRestorePick}
              disabled={restoring}
            />
          </label>
        </div>
      </div>

      <ConfirmDialog
        open={restoreConfirmOpen}
        title={t("confirmRestore")}
        confirmLabel={t("restoreLabel")}
        cancelLabel={t("cancel")}
        danger
        busy={restoring}
        onConfirm={() => void confirmRestore()}
        onCancel={() => {
          setRestoreConfirmOpen(false);
          setPendingRestoreFile(null);
        }}
      />

      {recoverySecrets && (
        <OneTimeSecrets
          title={t("restoreRecoveryTitle")}
          hint={t("restoreRecoveryHint")}
          secrets={recoverySecrets}
          downloadFilename={`kibble-restore-passwords_${new Date().toISOString().slice(0, 10)}.txt`}
          onClose={() => setRecoverySecrets(null)}
        />
      )}
    </main>
  );
}
