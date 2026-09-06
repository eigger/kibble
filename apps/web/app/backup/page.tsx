"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, apiJson, API_URL } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../lib/toast-context";
import { useLocale } from "../../lib/i18n/locale-context";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { OneTimeSecrets, type OneTimeSecret } from "../../components/OneTimeSecrets";

type BackupPreflight = {
  ok: boolean;
  checks: { name: string; ok: boolean; detail?: string }[];
  sourceBytes: number;
  fileCount: number;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

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
      // 다운로드는 새 탭이 받아 간다 — 거기서 무엇이 실패하든 이 화면은 알 수 없다.
      // 그래서 눌러 보기 전에 실패할 조건(tar·업로드 디렉터리·여유 공간)을 먼저 묻는다.
      const preflight = await apiJson<BackupPreflight>("/api/backup/export/preflight");
      const failed = preflight.checks.find((check) => !check.ok);
      if (failed) {
        show(t("backupPreflightFailed", { detail: failed.detail ?? failed.name }), "error");
        return;
      }
      // 아카이브를 다 만든 뒤에야 첫 바이트가 나가므로 새 탭은 그동안 빈 화면이다.
      // 그게 정상이라는 걸 미리 알려 준다 — 이 침묵이 "아무것도 안 됨"으로 읽혔다.
      show(t("backupPreparingToast", { size: formatBytes(preflight.sourceBytes) }), "info");

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
        <p className="backup-scope-warning">{t("backupScopeWarning")}</p>
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
