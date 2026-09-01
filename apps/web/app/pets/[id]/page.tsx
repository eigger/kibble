"use client";

import Link from "next/link";
import { use, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, apiJson } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { useLocale } from "../../../lib/i18n/locale-context";
import { useToast } from "../../../lib/toast-context";
import type { PetDetail, Species } from "../../../lib/types";
import { PetPhoto } from "../../../components/PetPhoto";

const SPECIES_OPTIONS: Species[] = ["CAT", "DOG", "OTHER"];

function isoToDateInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export default function PetEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: petId } = use(params);

  const router = useRouter();
  const { user, loading } = useAuth();
  const { t } = useLocale();
  const { show } = useToast();

  const [pet, setPet] = useState<PetDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        setPet(await apiJson<PetDetail>(`/api/pets/${petId}`));
      } catch {
        setLoadError(t("petLoadError"));
      }
    })();
  }, [user, petId, t]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!pet) return;
    setSaving(true);
    try {
      const updated = await apiJson<PetDetail>(`/api/pets/${petId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: pet.name,
          species: pet.species,
          breed: pet.breed || null,
          sex: pet.sex,
          neutered: pet.neutered,
          birthDate: pet.birthDate ? `${isoToDateInput(pet.birthDate)}T00:00:00.000Z` : null,
          adoptionDate: pet.adoptionDate ? `${isoToDateInput(pet.adoptionDate)}T00:00:00.000Z` : null,
          registrationNo: pet.registrationNo || null,
          microchipNo: pet.microchipNo || null,
          color: pet.color || null,
          sortOrder: pet.sortOrder,
        }),
      });
      setPet(updated);
      show(t("petSavedToast"), "success");
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : t("petSaveError"), "error");
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoChange(file: File | null) {
    if (!file || !pet) return;
    const formData = new FormData();
    formData.append("file", file);
    setSaving(true);
    try {
      const res = await apiFetch(`/api/pets/${petId}/photo`, { method: "POST", body: formData });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : t("petPhotoError"));
      setPet(body as PetDetail);
      show(t("petPhotoSavedToast"), "success");
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : t("petPhotoError"), "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemovePhoto() {
    if (!pet?.photoPath) return;
    setSaving(true);
    try {
      setPet(await apiJson<PetDetail>(`/api/pets/${petId}/photo`, { method: "DELETE" }));
      show(t("petPhotoRemovedToast"), "info");
    } catch {
      show(t("petPhotoError"), "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user) return null;
  if (loadError) {
    return (
      <main className="container">
        <p className="error-text">{loadError}</p>
      </main>
    );
  }
  if (!pet) {
    return (
      <main className="container">
        <p>{t("loading")}</p>
      </main>
    );
  }

  return (
    <main className="container">
      <p>
        <Link href="/pets">{t("petsBackLink")}</Link>
      </p>
      <h1>{t("petEditTitle", { name: pet.name })}</h1>

      <section className="card pet-photo-section">
        <PetPhoto petId={pet.id} photoPath={pet.photoPath} alt={pet.name} className="pet-photo-preview" />
        <label className="btn-link">
          {t("petPhotoUpload")}
          <input
            type="file"
            accept="image/*"
            hidden
            disabled={saving}
            onChange={(e) => void handlePhotoChange(e.target.files?.[0] ?? null)}
          />
        </label>
        {pet.photoPath && (
          <button type="button" className="btn-link" disabled={saving} onClick={() => void handleRemovePhoto()}>
            {t("petPhotoRemove")}
          </button>
        )}
      </section>

      <form className="form card" onSubmit={(e) => void handleSave(e)}>
        <label className="field-label" htmlFor="pet-name">
          {t("petNameLabel")}
        </label>
        <input
          id="pet-name"
          value={pet.name}
          onChange={(e) => setPet({ ...pet, name: e.target.value })}
          required
          maxLength={100}
        />

        <p className="field-label">{t("petSpeciesLabel")}</p>
        <div className="chip-row" role="group" aria-label={t("petSpeciesLabel")}>
          {SPECIES_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={`chip ${pet.species === option ? "chip-selected" : ""}`}
              onClick={() => setPet({ ...pet, species: option })}
            >
              {t(`species.${option}`)}
            </button>
          ))}
        </div>

        <label className="field-label" htmlFor="pet-breed">
          {t("petBreedLabel")}
        </label>
        <input
          id="pet-breed"
          value={pet.breed ?? ""}
          onChange={(e) => setPet({ ...pet, breed: e.target.value })}
          maxLength={100}
        />

        <p className="field-label">{t("petSexLabel")}</p>
        <select value={pet.sex ?? ""} onChange={(e) => setPet({ ...pet, sex: (e.target.value || null) as PetDetail["sex"] })}>
          <option value="">{t("petSexUnknown")}</option>
          <option value="MALE">{t("petSexMale")}</option>
          <option value="FEMALE">{t("petSexFemale")}</option>
          <option value="UNKNOWN">{t("petSexUnknownOption")}</option>
        </select>

        <label className="form-label">
          <input
            type="checkbox"
            checked={pet.neutered}
            onChange={(e) => setPet({ ...pet, neutered: e.target.checked })}
          />
          {t("petNeuteredLabel")}
        </label>

        <label className="field-label" htmlFor="pet-birth">
          {t("petBirthDateLabel")}
        </label>
        <input
          id="pet-birth"
          type="date"
          value={isoToDateInput(pet.birthDate)}
          onChange={(e) =>
            setPet({
              ...pet,
              birthDate: e.target.value ? `${e.target.value}T00:00:00.000Z` : null,
            })
          }
        />

        <label className="field-label" htmlFor="pet-adoption">
          {t("petAdoptionDateLabel")}
        </label>
        <input
          id="pet-adoption"
          type="date"
          value={isoToDateInput(pet.adoptionDate)}
          onChange={(e) =>
            setPet({
              ...pet,
              adoptionDate: e.target.value ? `${e.target.value}T00:00:00.000Z` : null,
            })
          }
        />

        <label className="field-label" htmlFor="pet-reg">
          {t("petRegistrationNoLabel")}
        </label>
        <input
          id="pet-reg"
          inputMode="numeric"
          pattern="\d{15}"
          value={pet.registrationNo ?? ""}
          onChange={(e) => setPet({ ...pet, registrationNo: e.target.value })}
          placeholder={t("petRegistrationNoPlaceholder")}
        />

        <label className="field-label" htmlFor="pet-chip">
          {t("petMicrochipLabel")}
        </label>
        <input
          id="pet-chip"
          value={pet.microchipNo ?? ""}
          onChange={(e) => setPet({ ...pet, microchipNo: e.target.value })}
          maxLength={50}
        />

        <label className="field-label" htmlFor="pet-color">
          {t("petColorLabel")}
        </label>
        <input
          id="pet-color"
          value={pet.color ?? ""}
          onChange={(e) => setPet({ ...pet, color: e.target.value })}
          maxLength={100}
        />

        <label className="field-label" htmlFor="pet-sort">
          {t("petSortOrderLabel")}
        </label>
        <input
          id="pet-sort"
          type="number"
          min={0}
          max={9999}
          value={pet.sortOrder}
          onChange={(e) => setPet({ ...pet, sortOrder: Number(e.target.value) })}
        />

        <button type="submit" disabled={saving}>
          {saving ? t("saving") : t("petSaveButton")}
        </button>
      </form>
    </main>
  );
}
