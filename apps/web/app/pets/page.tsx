"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiJson } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useLocale } from "../../lib/i18n/locale-context";
import { useToast } from "../../lib/toast-context";
import type { Pet, Species } from "../../lib/types";
import { PetPhoto } from "../../components/PetPhoto";

const SPECIES_OPTIONS: Species[] = ["CAT", "DOG", "OTHER"];

export default function PetsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { t } = useLocale();
  const { show } = useToast();
  const [pets, setPets] = useState<Pet[]>([]);
  const [name, setName] = useState("");
  const [species, setSpecies] = useState<Species>("CAT");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  async function refresh() {
    setPets(await apiJson<Pet[]>("/api/pets"));
  }

  useEffect(() => {
    if (user) void refresh();
  }, [user]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setAdding(true);
    try {
      await apiJson("/api/pets", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), species }),
      });
      setName("");
      await refresh();
      show(t("petAddedToast"), "success");
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : t("petCreateError"), "error");
    } finally {
      setAdding(false);
    }
  }

  if (loading || !user) return null;

  return (
    <main className="container">
      <p>
        <Link href="/settings">{t("settingsLabel")}</Link>
      </p>
      <h1>{t("petsTitle")}</h1>
      <p className="meta">{t("petsIntro")}</p>

      <ul className="pet-list">
        {pets.map((pet) => (
          <li key={pet.id} className="pet-list-item">
            <PetPhoto petId={pet.id} photoPath={pet.photoPath} alt={pet.name} className="pet-list-photo" />
            <div>
              <Link href={`/pets/${pet.id}`}>{pet.name}</Link>
              <span className="meta"> · {t(`species.${pet.species}`)}</span>
            </div>
          </li>
        ))}
      </ul>

      <form className="form card" onSubmit={(e) => void handleAdd(e)}>
        <h2>{t("petAddTitle")}</h2>
        <input
          placeholder={t("petNamePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={100}
        />
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
        <button type="submit" disabled={adding || !name.trim()}>
          {adding ? t("saving") : t("petAddButton")}
        </button>
      </form>
    </main>
  );
}
