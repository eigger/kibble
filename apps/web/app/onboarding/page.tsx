"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiJson } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useLocale } from "../../lib/i18n/locale-context";
import type { Pet, Species } from "../../lib/types";

const SPECIES_OPTIONS: Species[] = ["CAT", "DOG", "OTHER"];

export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading, refreshUser, logout } = useAuth();
  const { t } = useLocale();
  const [name, setName] = useState("");
  const [species, setSpecies] = useState<Species>("CAT");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!loading && user && !user.needsPet) router.push("/");
  }, [loading, user, router]);

  async function confirmOnboardingComplete(): Promise<boolean> {
    const me = await refreshUser();
    if (me && !me.needsPet) return true;

    const status = await apiJson<{ needsPet: boolean }>("/api/onboarding/status");
    if (!status.needsPet) {
      await refreshUser();
      return true;
    }
    return false;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiJson<Pet>("/api/pets", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), species }),
      });

      const ready = await confirmOnboardingComplete();
      if (!ready) {
        setError(t("petRefreshError"));
        return;
      }
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("petCreateError"));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !user) {
    return (
      <main className="container">
        <p>{t("loading")}</p>
      </main>
    );
  }

  return (
    <main className="container">
      <h1>{t("onboardingTitle")}</h1>
      <p className="meta">{t("onboardingIntro")}</p>

      <form onSubmit={handleSubmit} className="form">
        <label className="field-label" htmlFor="pet-name">
          {t("petNameLabel")}
        </label>
        <input
          id="pet-name"
          type="text"
          autoComplete="off"
          placeholder={t("petNamePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={100}
        />

        <p className="field-label">{t("petSpeciesLabel")}</p>
        <div className="chip-row" role="group" aria-label={t("petSpeciesLabel")}>
          {SPECIES_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={`chip ${species === option ? "chip-selected" : ""}`}
              onClick={() => setSpecies(option)}
            >
              {t(`species.${option}`)}
            </button>
          ))}
        </div>

        <button type="submit" disabled={submitting || name.trim().length === 0}>
          {submitting ? t("saving") : t("onboardingSubmit")}
        </button>
        {error && <p className="error-text">{error}</p>}
      </form>

      <p className="onboarding-escape">
        <button type="button" className="btn-link" onClick={() => void logout()}>
          {t("logoutButton")}
        </button>
      </p>
    </main>
  );
}
