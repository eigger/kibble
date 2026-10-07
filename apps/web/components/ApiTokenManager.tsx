"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { ConfirmDialog } from "./ConfirmDialog";
import { useLocale } from "../lib/i18n/locale-context";
import type { Pet } from "../lib/types";

type ApiToken = {
  id: string;
  name: string;
  scopes: string[];
  petId: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  pet?: { name: string } | null;
};

type IssuedToken = ApiToken & { token: string };

/** Manage household API tokens; the API itself gates this section to OWNERs. */
export function ApiTokenManager({ isHouseholdOwner }: { isHouseholdOwner: boolean }) {
  const { t, formatDateTime } = useLocale();
  const [pets, setPets] = useState<Pet[]>([]);
  const [petId, setPetId] = useState("");
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [issuedToken, setIssuedToken] = useState<IssuedToken | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiToken | null>(null);

  const load = useCallback(async () => {
    if (!isHouseholdOwner) return;
    try {
      const tokenResponse = await apiFetch("/api/tokens");
      if (!tokenResponse.ok) throw new Error(String(tokenResponse.status));
      const petResponse = await apiFetch("/api/pets");
      if (!petResponse.ok) throw new Error(String(petResponse.status));
      const [tokenRows, petRows] = await Promise.all([
        tokenResponse.json() as Promise<ApiToken[]>,
        petResponse.json() as Promise<Pet[]>,
      ]);
      setTokens(tokenRows);
      setPets(petRows);
      setPetId((current) => current || petRows[0]?.id || "");
    } catch {
      setMessage(t("apiTokenLoadError"));
    }
  }, [isHouseholdOwner, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const createToken = useCallback(async () => {
    if (!petId) return;
    setBusy(true);
    setIssuedToken(null);
    setMessage(null);
    try {
      const pet = pets.find((row) => row.id === petId);
      const response = await apiFetch("/api/tokens", {
        method: "POST",
        body: JSON.stringify({
          name: `Home Assistant · ${pet?.name ?? "Kibble"}`,
          scopes: ["state:read"],
          petId,
        }),
      });
      if (!response.ok) throw new Error(String(response.status));
      setIssuedToken((await response.json()) as IssuedToken);
      setMessage(t("apiTokenCreatedCopyNow"));
      await load();
    } catch (err) {
      setMessage(t("apiTokenCreateError", { status: err instanceof Error ? err.message : "" }));
    } finally {
      setBusy(false);
    }
  }, [load, petId, pets, t]);

  const revokeToken = useCallback(async (token: ApiToken) => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await apiFetch(`/api/tokens/${encodeURIComponent(token.id)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(String(response.status));
      if (issuedToken?.id === token.id) setIssuedToken(null);
      await load();
      setMessage(t("apiTokenRevoked"));
    } catch (err) {
      setMessage(t("apiTokenRevokeError", { status: err instanceof Error ? err.message : "" }));
    } finally {
      setBusy(false);
      setRevokeTarget(null);
    }
  }, [issuedToken, load, t]);

  const copyToken = useCallback(async () => {
    if (!issuedToken) return;
    try {
      await navigator.clipboard.writeText(issuedToken.token);
      setMessage(t("apiTokenCopied"));
    } catch {
      setMessage(t("apiTokenSelectToCopy"));
    }
  }, [issuedToken, t]);

  if (!isHouseholdOwner) return null;

  return (
    <section className="card api-token-manager">
      <h2>{t("apiTokenManagerTitle")}</h2>
      <p className="meta">{t("apiTokenManagerHint")}</p>
      {pets.length > 0 ? (
        <label className="field-label" htmlFor="api-token-pet">
          {t("apiExplorerPetLabel")}
          <select id="api-token-pet" value={petId} onChange={(event) => setPetId(event.target.value)}>
            {pets.map((pet) => <option key={pet.id} value={pet.id}>{pet.name}</option>)}
          </select>
        </label>
      ) : (
        <p className="meta">{t("apiExplorerNoPets")}</p>
      )}
      <button type="button" className="secondary" onClick={() => void createToken()} disabled={!petId || busy}>
        {busy ? t("processingLabel") : t("apiTokenCreateReadOnly")}
      </button>
      {message && <p className="meta" role="status">{message}</p>}
      {issuedToken && (
        <div className="api-token-issued">
          <p>{t("apiTokenOneTimeWarning")}</p>
          <code>{issuedToken.token}</code>
          <button type="button" className="secondary" onClick={() => void copyToken()}>
            {t("copyButton")}
          </button>
        </div>
      )}
      <div className="api-token-list">
        {tokens.map((token) => (
          <div className="api-token-row" key={token.id}>
            <div>
              <strong>{token.name}</strong>
              <p className="meta">
                {token.pet?.name ?? t("apiTokenAnyPet")} · {token.scopes.join(", ")} · {t("apiTokenLastUsed")}: {token.lastUsedAt ? formatDateTime(token.lastUsedAt) : t("neverLabel")}
              </p>
            </div>
            <button type="button" className="danger" onClick={() => setRevokeTarget(token)} disabled={busy}>
              {t("revokeButton")}
            </button>
          </div>
        ))}
        {tokens.length === 0 && <p className="meta">{t("apiTokenNone")}</p>}
      </div>
      <ConfirmDialog
        open={revokeTarget != null}
        title={revokeTarget ? t("apiTokenRevokeConfirm", { name: revokeTarget.name }) : ""}
        confirmLabel={t("revokeButton")}
        cancelLabel={t("cancel")}
        danger
        busy={busy}
        onConfirm={() => revokeTarget && void revokeToken(revokeTarget)}
        onCancel={() => !busy && setRevokeTarget(null)}
      />
    </section>
  );
}
