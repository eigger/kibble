"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiJson } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useLocale } from "../lib/i18n/locale-context";
import { useToast } from "../lib/toast-context";
import type {
  Pet,
  Preset,
  CreatedEvent,
  TodaySummaryRow,
  TimelineEvent,
  ParseSuggestion,
  ParseEntryResponse,
} from "../lib/types";

interface HomePayload {
  pets: Pet[];
  activePet: Pet | null;
  presets: Preset[];
  todaySummary: TodaySummaryRow[];
  recentEvents: TimelineEvent[];
}

function newDedupeKey(petId: string, presetId: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  const suffix = uuid ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `web:${petId}:${presetId}:${suffix}`;
}

function formatEventTime(iso: string, locale: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(locale === "ko" ? "ko-KR" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function eventDisplayLabel(event: TimelineEvent, t: (key: string) => string): string {
  if (event.preset?.label) return t(event.preset.label);
  return t(event.eventType.label);
}

/** P1-24 순서: 제공량 → 섭취량 (예: 100g / 30g) */
function eventDetailLine(event: TimelineEvent): string | null {
  const unit = event.unit ?? "";
  const parts: string[] = [];

  if (event.quantityOffered != null && event.quantity != null) {
    parts.push(`${event.quantityOffered}${unit} / ${event.quantity}${unit}`);
  } else if (event.quantityOffered != null) {
    parts.push(event.unit ? `${event.quantityOffered}${unit}` : String(event.quantityOffered));
  } else if (event.quantity != null) {
    parts.push(event.unit ? `${event.quantity}${unit}` : String(event.quantity));
  }

  if (event.note?.trim()) parts.push(event.note.trim());
  return parts.length > 0 ? parts.join(" · ") : null;
}

function createdEventToTimeline(event: CreatedEvent): TimelineEvent {
  return {
    id: event.id,
    occurredAt: event.occurredAt,
    quantity: event.quantity,
    quantityOffered: event.quantityOffered,
    unit: event.unit,
    scaleValue: null,
    note: event.note,
    preset: event.preset,
    eventType: event.eventType,
  };
}

function bumpSummary(rows: TodaySummaryRow[], eventTypeKey: string, label: string): TodaySummaryRow[] {
  const idx = rows.findIndex((r) => r.eventTypeKey === eventTypeKey);
  if (idx >= 0) {
    return rows.map((r, i) => (i === idx ? { ...r, count: r.count + 1 } : r));
  }
  return [...rows, { eventTypeKey, label, count: 1 }];
}

function decrementSummary(rows: TodaySummaryRow[], eventTypeKey: string): TodaySummaryRow[] {
  return rows
    .map((r) => (r.eventTypeKey === eventTypeKey ? { ...r, count: r.count - 1 } : r))
    .filter((r) => r.count > 0);
}

export default function HomePage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const userId = user?.id;
  const needsPet = user?.needsPet;
  const { t, locale } = useLocale();
  const { show } = useToast();
  const [pets, setPets] = useState<Pet[]>([]);
  const [activePet, setActivePet] = useState<Pet | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [todaySummary, setTodaySummary] = useState<TodaySummaryRow[]>([]);
  const [recentEvents, setRecentEvents] = useState<TimelineEvent[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [parseBatch, setParseBatch] = useState<ParseEntryResponse | null>(null);
  const loadSeq = useRef(0);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!loading && needsPet) router.push("/onboarding");
  }, [loading, needsPet, router]);

  const applyHomePayload = useCallback((data: HomePayload) => {
    setPets(data.pets);
    setActivePet(data.activePet);
    setPresets(data.presets);
    setTodaySummary(data.todaySummary);
    setRecentEvents(data.recentEvents);
  }, []);

  const loadHome = useCallback(
    async (petId?: string): Promise<number> => {
      const seq = ++loadSeq.current;
      const qs = petId ? `?petId=${encodeURIComponent(petId)}` : "";
      const data = await apiJson<HomePayload>(`/api/home${qs}`);
      if (seq !== loadSeq.current) return seq;
      applyHomePayload(data);
      return seq;
    },
    [applyHomePayload],
  );

  useEffect(() => {
    if (!userId || needsPet) return;
    let cancelled = false;
    setDataLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const seq = await loadHome();
        if (cancelled || seq !== loadSeq.current) return;
      } catch (err) {
        if (cancelled) return;
        setPets([]);
        setActivePet(null);
        setPresets([]);
        setTodaySummary([]);
        setRecentEvents([]);
        if (err instanceof ApiError) {
          if (err.status === 401) {
            router.push("/login");
            return;
          }
          if (err.status === 403) {
            setLoadError(t("homeForbidden"));
            return;
          }
        }
        setLoadError(t("homeLoadError"));
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, needsPet, router, t, loadHome]);

  async function selectPet(pet: Pet) {
    if (pet.id === activePet?.id || dataLoading) return;
    setDataLoading(true);
    setLoadError(null);
    try {
      const seq = await loadHome(pet.id);
      if (seq !== loadSeq.current) return;
    } catch {
      setLoadError(t("homeLoadError"));
    } finally {
      if (loadSeq.current) setDataLoading(false);
    }
  }

  const starterPresets = useMemo(() => presets.filter((p) => p.isStarter), [presets]);
  const morePresets = useMemo(() => presets.filter((p) => !p.isStarter), [presets]);

  const summaryLine = useMemo(() => {
    if (todaySummary.length === 0) return null;
    const parts = todaySummary.map((row) => `${t(row.label)} ${row.count}`);
    return `${t("homeToday")} · ${parts.join(" · ")}`;
  }, [todaySummary, t]);

  const tabPanelId = activePet ? `home-pet-panel-${activePet.id}` : undefined;

  const [recording, setRecording] = useState(false);
  const inFlightDedupeKey = useRef<string | null>(null);

  function applyCreatedEvent(event: CreatedEvent) {
    setRecentEvents((prev) => [createdEventToTimeline(event), ...prev]);
    setTodaySummary((prev) =>
      bumpSummary(prev, event.eventType.key, event.eventType.label),
    );
  }

  async function persistSuggestion(suggestion: ParseSuggestion, entryId: string, rawText: string) {
    if (!activePet) return;
    const body: Record<string, unknown> = {
      petId: activePet.id,
      source: "WEB",
      rawText,
      entryId,
      needsReview: suggestion.needsReview,
    };
    if (suggestion.presetId) body.presetId = suggestion.presetId;
    else body.eventTypeId = suggestion.eventTypeId;
    if (suggestion.quantity != null) body.quantity = suggestion.quantity;
    if (suggestion.unit) body.unit = suggestion.unit;
    if (suggestion.note) body.note = suggestion.note;
    if (suggestion.occurredAt) body.occurredAt = suggestion.occurredAt;

    const event = await apiJson<CreatedEvent>("/api/events", {
      method: "POST",
      body: JSON.stringify(body),
    });
    applyCreatedEvent(event);
  }

  async function handleTextSubmit(e: FormEvent) {
    e.preventDefault();
    const text = textInput.trim();
    if (!text || !activePet || recording) return;
    setRecording(true);
    try {
      const parsed = await apiJson<ParseEntryResponse>("/api/parse/entry", {
        method: "POST",
        body: JSON.stringify({ petId: activePet.id, text }),
      });
      setParseBatch(parsed);
      setTextInput("");
    } catch {
      show(t("parseError"), "error");
    } finally {
      setRecording(false);
    }
  }

  async function saveParseSuggestion(suggestion: ParseSuggestion) {
    if (!parseBatch || recording) return;
    setRecording(true);
    try {
      await persistSuggestion(suggestion, parseBatch.entryId, parseBatch.rawText);
      setParseBatch((prev) => {
        if (!prev) return null;
        const next = prev.suggestions.filter((s) => s.rawLine !== suggestion.rawLine);
        return next.length > 0 ? { ...prev, suggestions: next } : null;
      });
      show(t("recordSaved", { label: t(suggestion.label) }), "success");
    } catch {
      show(t("recordError"), "error");
    } finally {
      setRecording(false);
    }
  }

  async function saveAllParseSuggestions() {
    if (!parseBatch || recording) return;
    setRecording(true);
    const batch = parseBatch;
    try {
      for (const suggestion of batch.suggestions) {
        await persistSuggestion(suggestion, batch.entryId, batch.rawText);
      }
      setParseBatch(null);
      show(t("recordSaved", { label: String(batch.suggestions.length) }), "success");
    } catch {
      show(t("recordError"), "error");
    } finally {
      setRecording(false);
    }
  }

  function onPresetTap(preset: Preset) {
    if (!activePet || recording) return;
    setRecording(true);
    const label = t(preset.label);
    const dedupeKey = inFlightDedupeKey.current ?? newDedupeKey(activePet.id, preset.id);
    inFlightDedupeKey.current = dedupeKey;

    (async () => {
      try {
        const event = await apiJson<CreatedEvent>("/api/events", {
          method: "POST",
          body: JSON.stringify({
            petId: activePet.id,
            presetId: preset.id,
            source: "WEB",
            dedupeKey,
          }),
        });

        const timelineEntry = createdEventToTimeline(event);
        const typeKey = event.eventType.key;

        setRecentEvents((prev) => [timelineEntry, ...prev]);
        setTodaySummary((prev) => bumpSummary(prev, typeKey, event.eventType.label));

        show(t("recordSaved", { label }), "success", {
          label: t("undo"),
          onClick: () => {
            void (async () => {
              try {
                await apiJson(`/api/events/${event.id}`, { method: "DELETE" });
                setRecentEvents((prev) => prev.filter((e) => e.id !== event.id));
                setTodaySummary((prev) => decrementSummary(prev, typeKey));
                show(t("recordUndone"), "info");
              } catch {
                show(t("recordError"), "error");
              }
            })();
          },
        });
      } catch {
        show(t("recordError"), "error");
      } finally {
        inFlightDedupeKey.current = null;
        setRecording(false);
      }
    })();
  }

  if (loading || !user || needsPet) {
    return (
      <main className="container">
        <p>{t("loading")}</p>
      </main>
    );
  }

  return (
    <main className="container home-page">
      <header className="home-header">
        <h1>{activePet ? activePet.name : t("appName")}</h1>
        {pets.length >= 2 && (
          <div className="pet-tabs" role="tablist" aria-label={t("homePetTabsLabel")}>
            {pets.map((pet) => (
              <button
                key={pet.id}
                type="button"
                role="tab"
                id={`home-pet-tab-${pet.id}`}
                aria-selected={pet.id === activePet?.id}
                aria-controls={tabPanelId}
                className={`pet-tab${pet.id === activePet?.id ? " pet-tab-active" : ""}`}
                onClick={() => void selectPet(pet)}
              >
                {pet.name}
              </button>
            ))}
          </div>
        )}
      </header>

      {dataLoading && recentEvents.length === 0 ? (
        <p className="meta">{t("loading")}</p>
      ) : loadError ? (
        <p className="error-text">{loadError}</p>
      ) : (
        <>
          {summaryLine && <p className="home-summary-line">{summaryLine}</p>}

          <section
            className="timeline-section"
            id={tabPanelId}
            role={pets.length >= 2 ? "tabpanel" : undefined}
            aria-labelledby={activePet ? `home-pet-tab-${activePet.id}` : undefined}
          >
            {recentEvents.length === 0 ? (
              <p className="meta timeline-empty">{t("homeTimelineEmpty")}</p>
            ) : (
              <ul className="timeline-list">
                {recentEvents.map((event) => {
                  const detail = eventDetailLine(event);
                  return (
                    <li key={event.id} className="timeline-item">
                      <time className="timeline-time" dateTime={event.occurredAt}>
                        {formatEventTime(event.occurredAt, locale)}
                      </time>
                      <div className="timeline-body">
                        <span className="timeline-label">{eventDisplayLabel(event, t)}</span>
                        {detail && <span className="timeline-detail">{detail}</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}

      <footer className="home-input-bar">
        <div className="home-input-bar-inner">
          <section className="home-quick-section" aria-label={t("homeQuickRecord")}>
            {starterPresets.length > 0 ? (
              <div className="chip-row">
                {starterPresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="chip"
                    disabled={recording || !activePet}
                    onClick={() => onPresetTap(preset)}
                  >
                    {t(preset.label)}
                  </button>
                ))}
              </div>
            ) : (
              !dataLoading && !loadError && <p className="meta home-no-chips">{t("homeNoPresets")}</p>
            )}
            {morePresets.length > 0 && (
              <button
                type="button"
                className="btn-link"
                disabled={recording}
                onClick={() => setMoreOpen(true)}
              >
                {t("homeMorePresets", { count: morePresets.length })}
              </button>
            )}
          </section>
          {parseBatch && parseBatch.suggestions.length > 0 && (
            <section className="parse-suggestions" aria-label={t("parseSuggestionsTitle")}>
              <p className="meta parse-suggestions-title">{t("parseSuggestionsTitle")}</p>
              <div className="chip-row">
                {parseBatch.suggestions.map((suggestion) => (
                  <button
                    key={suggestion.rawLine}
                    type="button"
                    className="chip chip-suggestion"
                    disabled={recording}
                    onClick={() => void saveParseSuggestion(suggestion)}
                  >
                    {t(suggestion.label)}
                    {suggestion.quantity != null && (
                      <span className="chip-qty">
                        {" "}
                        {suggestion.quantity}
                        {suggestion.unit ?? ""}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {parseBatch.suggestions.length > 1 && (
                <button
                  type="button"
                  className="btn-link"
                  disabled={recording}
                  onClick={() => void saveAllParseSuggestions()}
                >
                  {t("parseSaveAll")}
                </button>
              )}
            </section>
          )}
          <form className="home-text-form" onSubmit={(e) => void handleTextSubmit(e)}>
            <input
              type="text"
              className="home-text-input"
              placeholder={t("homeInputPlaceholder")}
              value={textInput}
              disabled={recording || !activePet}
              onChange={(e) => setTextInput(e.target.value)}
            />
            <button type="submit" className="home-text-submit" disabled={recording || !activePet || !textInput.trim()}>
              {t("textSubmit")}
            </button>
          </form>
          <p className="meta home-input-hint">{t("homeOnboardingHint")}</p>
        </div>
      </footer>

      {moreOpen && (
        <div className="sheet-backdrop" role="presentation" onClick={() => setMoreOpen(false)}>
          <div
            className="sheet-card"
            role="dialog"
            aria-label={t("homeMorePresetsTitle")}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-handle" />
            <h2>{t("homeMorePresetsTitle")}</h2>
            <div className="sheet-grid">
              {morePresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="sheet-item"
                  disabled={recording}
                  onClick={() => {
                    setMoreOpen(false);
                    onPresetTap(preset);
                  }}
                >
                  {t(preset.label)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
