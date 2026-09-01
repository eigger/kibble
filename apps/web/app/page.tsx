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
import type { JournalStats } from "@kibble/shared";
import { bumpJournalStats, journalInsightMessage } from "@kibble/shared";
import { EventDetailSheet, type EventDetailDraft } from "../components/EventDetailSheet";
import { ChipActionSheet } from "../components/ChipActionSheet";
import { PresetChip, MorePresetItem } from "../components/PresetChip";

interface HomePayload {
  pets: Pet[];
  activePet: Pet | null;
  presets: Preset[];
  todaySummary: TodaySummaryRow[];
  recentEvents: TimelineEvent[];
  journalStats: JournalStats;
}

const TIMELINE_EXAMPLES = [
  { label: "eventType.meal", time: "08:00", detail: "40g" },
  { label: "eventType.water", time: "14:00", detail: null },
] as const;

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
    timeZone: "Asia/Seoul",
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
  const [journalStats, setJournalStats] = useState<JournalStats>({
    totalEventCount: 0,
    distinctDayCount: 0,
  });
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [parseBatch, setParseBatch] = useState<ParseEntryResponse | null>(null);
  const [parseBatchRetryable, setParseBatchRetryable] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailDraft, setDetailDraft] = useState<EventDetailDraft | null>(null);
  const [detailSaving, setDetailSaving] = useState(false);
  const [reviewEventIds, setReviewEventIds] = useState<Map<string, string>>(new Map());
  const [chipAction, setChipAction] = useState<{ preset: Preset; label: string } | null>(null);
  const loadSeq = useRef(0);
  const recentEventsRef = useRef<TimelineEvent[]>([]);

  useEffect(() => {
    recentEventsRef.current = recentEvents;
  }, [recentEvents]);

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
    setJournalStats(data.journalStats);
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

  const journalInsight = useMemo(
    () => journalInsightMessage(journalStats, t),
    [journalStats, t],
  );

  const tabPanelId = activePet ? `home-pet-panel-${activePet.id}` : undefined;

  const [recording, setRecording] = useState(false);
  const inFlightDedupeKey = useRef<string | null>(null);

  function applyCreatedEvent(event: CreatedEvent) {
    const timelineEntry = createdEventToTimeline(event);
    const existing = recentEventsRef.current;
    const isNew = !existing.some((e) => e.id === event.id);

    setRecentEvents((prev) => {
      const without = prev.filter((e) => e.id !== event.id);
      return [timelineEntry, ...without];
    });

    if (!isNew) return;

    const latestOccurredAt = existing[0]?.occurredAt ?? null;
    setJournalStats((stats) => bumpJournalStats(stats, event.occurredAt, latestOccurredAt));
    setTodaySummary((prev) =>
      bumpSummary(prev, event.eventType.key, event.eventType.label),
    );
  }

  async function persistSuggestion(
    suggestion: ParseSuggestion,
    entryId: string,
    dedupeKey: string,
  ): Promise<CreatedEvent> {
    if (!activePet) throw new Error("NO_PET");
    const body: Record<string, unknown> = {
      petId: activePet.id,
      source: "WEB",
      rawText: suggestion.rawLine,
      entryId,
      dedupeKey,
      needsReview: suggestion.needsReview,
    };
    if (suggestion.presetId) body.presetId = suggestion.presetId;
    else body.eventTypeId = suggestion.eventTypeId;
    if (suggestion.quantity != null) body.quantity = suggestion.quantity;
    if (suggestion.quantityOffered != null) body.quantityOffered = suggestion.quantityOffered;
    if (suggestion.unit) body.unit = suggestion.unit;
    if (suggestion.note) body.note = suggestion.note;
    if (suggestion.occurredAt) body.occurredAt = suggestion.occurredAt;

    const event = await apiJson<CreatedEvent>("/api/events", {
      method: "POST",
      body: JSON.stringify(body),
    });
    applyCreatedEvent(event);
    if (suggestion.needsReview) {
      setReviewEventIds((prev) => new Map(prev).set(dedupeKey, event.id));
    }
    return event;
  }

  function suggestionKey(entryId: string, suggestion: ParseSuggestion): string {
    return `${entryId}:${suggestion.lineIndex}`;
  }

  async function persistParseBatch(batch: ParseEntryResponse): Promise<ParseSuggestion[]> {
    const failed: ParseSuggestion[] = [];
    for (const suggestion of batch.suggestions) {
      try {
        await persistSuggestion(suggestion, batch.entryId, suggestionKey(batch.entryId, suggestion));
      } catch {
        failed.push(suggestion);
      }
    }
    return failed;
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
      setTextInput("");
      const failed = await persistParseBatch(parsed);
      const savedCount = parsed.suggestions.length - failed.length;
      if (savedCount > 0) {
        show(t("recordSavedCount", { count: String(savedCount) }), "success");
      }
      const failedIndexes = new Set(failed.map((s) => s.lineIndex));
      const needsReview = parsed.suggestions.filter((s) => s.needsReview && !failedIndexes.has(s.lineIndex));
      if (failed.length > 0) {
        setParseBatch({ ...parsed, suggestions: failed });
        setParseBatchRetryable(true);
        show(t("parsePartialError"), "error");
      } else if (needsReview.length > 0) {
        setParseBatch({ ...parsed, suggestions: needsReview });
        setParseBatchRetryable(false);
      } else {
        setParseBatch(null);
        setParseBatchRetryable(false);
      }
    } catch {
      show(t("parseError"), "error");
    } finally {
      setRecording(false);
    }
  }

  async function retryFailedSuggestions() {
    if (!parseBatch || recording) return;
    setRecording(true);
    const batch = parseBatch;
    try {
      const failed = await persistParseBatch(batch);
      const savedCount = batch.suggestions.length - failed.length;
      if (savedCount > 0) {
        show(t("recordSavedCount", { count: String(savedCount) }), "success");
      }
      setParseBatch(failed.length > 0 ? { ...batch, suggestions: failed } : null);
      setParseBatchRetryable(failed.length > 0);
      if (failed.length > 0) show(t("parsePartialError"), "error");
    } catch {
      show(t("recordError"), "error");
    } finally {
      setRecording(false);
    }
  }

  function openChipAction(preset: Preset) {
    setChipAction({ preset, label: t(preset.label) });
  }

  async function hidePresetChip(preset: Preset) {
    try {
      await apiJson(`/api/presets/${preset.id}`, {
        method: "PATCH",
        body: JSON.stringify({ hidden: true }),
      });
      setPresets((prev) => prev.filter((p) => p.id !== preset.id));
      setChipAction(null);
      show(t("presetHiddenToast"), "success", {
        label: t("undo"),
        onClick: () => {
          void (async () => {
            try {
              await apiJson(`/api/presets/${preset.id}`, {
                method: "PATCH",
                body: JSON.stringify({ hidden: false }),
              });
              if (activePet) {
                const seq = await loadHome(activePet.id);
                if (seq !== loadSeq.current) return;
              }
              show(t("presetUnhiddenToast"), "info");
            } catch {
              show(t("recordError"), "error");
            }
          })();
        },
      });
    } catch {
      show(t("recordError"), "error");
    }
  }

  function openDetailFromPreset(preset: Preset) {
    if (!activePet) return;
    setDetailDraft({
      mode: "create",
      petId: activePet.id,
      presetId: preset.id,
      label: t(preset.label),
      occurredAt: new Date().toISOString(),
      quantity: null,
      quantityOffered: null,
      unit: null,
      note: null,
      dedupeKey: newDedupeKey(activePet.id, preset.id),
    });
    setDetailOpen(true);
    setChipAction(null);
  }

  function openDetailFromSuggestion(suggestion: ParseSuggestion, entryId: string) {
    if (!activePet) return;
    const key = suggestionKey(entryId, suggestion);
    const eventId = reviewEventIds.get(key);
    setDetailDraft({
      mode: eventId ? "edit" : "create",
      eventId,
      petId: activePet.id,
      presetId: suggestion.presetId,
      eventTypeId: suggestion.eventTypeId,
      label: t(suggestion.label),
      occurredAt: suggestion.occurredAt ?? new Date().toISOString(),
      quantity: suggestion.quantity,
      quantityOffered: suggestion.quantityOffered,
      unit: suggestion.unit,
      note: suggestion.note,
      rawText: suggestion.rawLine,
      entryId,
      dedupeKey: key,
      needsReview: suggestion.needsReview,
    });
    setDetailOpen(true);
  }

  function openDetailFromEvent(event: TimelineEvent) {
    if (!activePet) return;
    setDetailDraft({
      mode: "edit",
      eventId: event.id,
      petId: activePet.id,
      presetId: event.preset?.id ?? null,
      label: eventDisplayLabel(event, t),
      occurredAt: event.occurredAt,
      quantity: event.quantity,
      quantityOffered: event.quantityOffered,
      unit: event.unit,
      note: event.note,
    });
    setDetailOpen(true);
  }

  function removeParseSuggestionByKey(dedupeKey: string | undefined) {
    if (!dedupeKey) return;
    setParseBatch((prev) => {
      if (!prev) return null;
      const next = prev.suggestions.filter((s) => suggestionKey(prev.entryId, s) !== dedupeKey);
      return next.length > 0 ? { ...prev, suggestions: next } : null;
    });
  }

  async function handleDetailSave(draft: EventDetailDraft) {
    setDetailSaving(true);
    try {
      if (draft.mode === "edit" && draft.eventId) {
        await apiJson(`/api/events/${draft.eventId}`, {
          method: "PATCH",
          body: JSON.stringify({
            occurredAt: draft.occurredAt,
            quantity: draft.quantity,
            quantityOffered: draft.quantityOffered,
            unit: draft.unit,
            note: draft.note,
            needsReview: false,
          }),
        });
        if (activePet) await loadHome(activePet.id);
        removeParseSuggestionByKey(draft.dedupeKey);
        show(t("eventDetailSaved"), "success");
      } else {
        const body: Record<string, unknown> = {
          petId: draft.petId,
          source: "WEB",
          occurredAt: draft.occurredAt,
          quantity: draft.quantity,
          quantityOffered: draft.quantityOffered,
          unit: draft.unit,
          note: draft.note,
          needsReview: false,
          dedupeKey:
            draft.dedupeKey ?? newDedupeKey(draft.petId, draft.presetId ?? "detail"),
        };
        if (draft.presetId) body.presetId = draft.presetId;
        else if (draft.eventTypeId) body.eventTypeId = draft.eventTypeId;
        if (draft.rawText) body.rawText = draft.rawText;
        if (draft.entryId) body.entryId = draft.entryId;

        const event = await apiJson<CreatedEvent>("/api/events", {
          method: "POST",
          body: JSON.stringify(body),
        });
        applyCreatedEvent(event);
        removeParseSuggestionByKey(draft.dedupeKey);
        show(t("recordSaved", { label: draft.label }), "success");
      }
      setDetailOpen(false);
      setDetailDraft(null);
    } catch {
      show(t("recordError"), "error");
    } finally {
      setDetailSaving(false);
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

        applyCreatedEvent(event);

        show(t("recordSaved", { label }), "success", {
          label: t("undo"),
          onClick: () => {
            void (async () => {
              try {
                await apiJson(`/api/events/${event.id}`, { method: "DELETE" });
                setRecentEvents((prev) => prev.filter((e) => e.id !== event.id));
                setTodaySummary((prev) => decrementSummary(prev, event.eventType.key));
                setJournalStats((prev) => ({
                  totalEventCount: Math.max(0, prev.totalEventCount - 1),
                  distinctDayCount: prev.distinctDayCount,
                }));
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
          {journalInsight && <p className="home-journal-insight">{journalInsight}</p>}

          <section
            className="timeline-section"
            id={tabPanelId}
            role={pets.length >= 2 ? "tabpanel" : undefined}
            aria-labelledby={activePet ? `home-pet-tab-${activePet.id}` : undefined}
          >
            {recentEvents.length === 0 ? (
              <div className="timeline-empty-state">
                <p className="meta timeline-empty">{t("homeTimelineEmpty")}</p>
                <ul className="timeline-list timeline-list-example" aria-hidden="true">
                  {TIMELINE_EXAMPLES.map((example) => (
                    <li key={example.label} className="timeline-item timeline-item-example">
                      <time className="timeline-time">{example.time}</time>
                      <div className="timeline-body">
                        <span className="timeline-label">
                          {t(example.label)}
                          <span className="timeline-example-badge">{t("homeExampleLabel")}</span>
                        </span>
                        {example.detail && (
                          <span className="timeline-detail">{example.detail}</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <>
                <ul className="timeline-list">
                  {recentEvents.map((event) => {
                    const detail = eventDetailLine(event);
                    return (
                      <li key={event.id}>
                        <button
                          type="button"
                          className="timeline-item timeline-item-clickable"
                          onClick={() => openDetailFromEvent(event)}
                        >
                          <time className="timeline-time" dateTime={event.occurredAt}>
                            {formatEventTime(event.occurredAt, locale)}
                          </time>
                          <div className="timeline-body">
                            <span className="timeline-label">{eventDisplayLabel(event, t)}</span>
                            {detail && <span className="timeline-detail">{detail}</span>}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <p className="meta home-timeline-hint">{t("homeTimelineEditHint")}</p>
              </>
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
                  <PresetChip
                    key={preset.id}
                    preset={preset}
                    label={t(preset.label)}
                    disabled={recording || !activePet}
                    onTap={onPresetTap}
                    onLongPress={openChipAction}
                  />
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
              <p className="meta parse-suggestions-title">
                {t(parseBatchRetryable ? "parseSuggestionsFailedTitle" : "parseSuggestionsTitle")}
              </p>
              <div className="chip-row">
                {parseBatch.suggestions.map((suggestion) => (
                  <button
                    key={suggestionKey(parseBatch.entryId, suggestion)}
                    type="button"
                    className={`chip chip-suggestion${suggestion.needsReview ? " chip-needs-review" : ""}`}
                    disabled={recording}
                    onClick={() => openDetailFromSuggestion(suggestion, parseBatch.entryId)}
                  >
                    {t(suggestion.label)}
                    {suggestion.quantityOffered != null && suggestion.quantity != null && (
                      <span className="chip-qty">
                        {" "}
                        {suggestion.quantityOffered}
                        {suggestion.unit ?? ""} / {suggestion.quantity}
                        {suggestion.unit ?? ""}
                      </span>
                    )}
                    {suggestion.quantityOffered == null && suggestion.quantity != null && (
                      <span className="chip-qty">
                        {" "}
                        {suggestion.quantity}
                        {suggestion.unit ?? ""}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {parseBatchRetryable && (
                <button
                  type="button"
                  className="btn-link"
                  disabled={recording}
                  onClick={() => void retryFailedSuggestions()}
                >
                  {t("parseRetryFailed")}
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
                <MorePresetItem
                  key={preset.id}
                  label={t(preset.label)}
                  disabled={recording}
                  onTap={() => {
                    setMoreOpen(false);
                    onPresetTap(preset);
                  }}
                  onLongPress={() => {
                    setMoreOpen(false);
                    openChipAction(preset);
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <ChipActionSheet
        open={chipAction != null}
        label={chipAction?.label ?? ""}
        onClose={() => setChipAction(null)}
        onDetail={() => chipAction && openDetailFromPreset(chipAction.preset)}
        onHide={() => chipAction && void hidePresetChip(chipAction.preset)}
        t={t}
      />

      <EventDetailSheet
        open={detailOpen}
        draft={detailDraft}
        saving={detailSaving}
        onClose={() => {
          if (detailSaving) return;
          setDetailOpen(false);
          setDetailDraft(null);
        }}
        onSave={(draft) => void handleDetailSave(draft)}
        onValidationError={(message) => show(message, "error")}
        t={t}
      />
    </main>
  );
}
