"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { kstDayKey } from "@kibble/shared";
import { apiJson, isApiError } from "../../lib/api";
import { formatApiErrorMessage } from "../../lib/apiErrorMessage";
import { useAuth } from "../../lib/auth-context";
import { useLocale } from "../../lib/i18n/locale-context";
import { useToast } from "../../lib/toast-context";
import {
  eventDetailLine,
  clinicFieldsFromContact,
  eventDisplayLabel,
  formatEventTime,
} from "../../lib/eventDisplay";
import { EventDetailSheet, type EventDetailDraft } from "../../components/EventDetailSheet";
import { EventAttachmentThumb } from "../../components/EventAttachmentThumb";
import {
  deleteEventAttachment,
  uploadEventAttachments,
} from "../../lib/eventAttachments";
import { fetchTimelinePage } from "../../lib/timeline";
import type { Pet, TimelineEvent, TodaySummaryRow } from "../../lib/types";
import type { EventAttachment } from "../../lib/types";

interface TodayBootstrap {
  pets: Pet[];
  activePet: Pet | null;
  todaySummary: TodaySummaryRow[];
}

export default function TodayPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const needsPet = user?.needsPet;
  const { t, locale } = useLocale();
  const { show } = useToast();

  const todayPeriod = useMemo(() => kstDayKey(new Date()), []);

  const [pets, setPets] = useState<Pet[]>([]);
  const [activePet, setActivePet] = useState<Pet | null>(null);
  const [todaySummary, setTodaySummary] = useState<TodaySummaryRow[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailDraft, setDetailDraft] = useState<EventDetailDraft | null>(null);
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailDeleting, setDetailDeleting] = useState(false);
  const [detailSaveError, setDetailSaveError] = useState<string | null>(null);
  const [detailAttachments, setDetailAttachments] = useState<EventAttachment[]>([]);
  const [detailPendingFiles, setDetailPendingFiles] = useState<File[]>([]);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!loading && needsPet) router.push("/onboarding");
  }, [loading, needsPet, router]);

  const loadToday = useCallback(
    async (petId?: string) => {
      setDataLoading(true);
      setLoadError(null);
      try {
        const qs = petId ? `?petId=${encodeURIComponent(petId)}` : "";
        const boot = await apiJson<TodayBootstrap>(`/api/home${qs}`);
        setPets(boot.pets);
        setActivePet(boot.activePet);
        setTodaySummary(boot.todaySummary);
        if (!boot.activePet) {
          setEvents([]);
          return;
        }
        const page = await fetchTimelinePage(boot.activePet.id, undefined, undefined, todayPeriod);
        setEvents(page);
      } catch (err) {
        if (isApiError(err) && err.status === 401) {
          router.push("/login");
          return;
        }
        setLoadError(t("todayLoadError"));
        setEvents([]);
      } finally {
        setDataLoading(false);
      }
    },
    [router, t, todayPeriod],
  );

  useEffect(() => {
    if (!user || needsPet) return;
    void loadToday();
  }, [user, needsPet, loadToday]);

  async function selectPet(pet: Pet) {
    if (pet.id === activePet?.id || dataLoading) return;
    setActivePet(pet);
    await loadToday(pet.id);
  }

  function openDetail(event: TimelineEvent, edit = false) {
    if (!activePet) return;
    setDetailSaveError(null);
    setDetailAttachments(event.attachments ?? []);
    setDetailPendingFiles([]);
    setDetailDraft({
      mode: edit ? "edit" : "view",
      eventId: event.id,
      petId: activePet.id,
      presetId: event.preset?.id ?? null,
      eventTypeKey: event.eventType.key,
      label: eventDisplayLabel(event, t),
      occurredAt: event.occurredAt,
      quantity: event.quantity,
      quantityOffered: event.quantityOffered,
      unit: event.unit,
      productName: event.productName,
      ...clinicFieldsFromContact(event),
      note: event.note,
      scaleType: event.eventType.scaleType ?? null,
      scaleValue: event.scaleValue,
    });
    setDetailOpen(true);
  }

  async function handleDetailSave(
    draft: EventDetailDraft,
    meta: { removedAttachmentIds: string[] },
  ) {
    if (!draft.eventId) return;
    setDetailSaving(true);
    setDetailSaveError(null);
    const filesToUpload = [...detailPendingFiles];
    try {
      await apiJson(`/api/events/${draft.eventId}`, {
        method: "PATCH",
        body: JSON.stringify({
          occurredAt: draft.occurredAt,
          quantity: draft.quantity,
          quantityOffered: draft.quantityOffered,
          unit: draft.unit,
          productName: draft.productName,
          clinicName: draft.clinicName,
          clinicAddress: draft.clinicAddress,
          note: draft.note,
          scaleValue: draft.scaleValue ?? null,
          needsReview: false,
        }),
      });
      if (filesToUpload.length > 0) {
        const { uploaded, remaining } = await uploadEventAttachments(draft.eventId, filesToUpload);
        if (remaining.length > 0) {
          setDetailPendingFiles(remaining);
          show(t("attachmentUploadPartial"), "error");
          return;
        }
        setDetailPendingFiles([]);
        if (uploaded.length > 0) {
          setDetailAttachments((prev) => [...prev, ...uploaded]);
        }
      }
      for (const attachmentId of meta.removedAttachmentIds) {
        await deleteEventAttachment(attachmentId);
      }
      if (activePet) await loadToday(activePet.id);
      setDetailOpen(false);
      setDetailDraft(null);
      show(t("eventDetailSaved"), "success");
    } catch (err) {
      const message = formatApiErrorMessage(err, t("recordError"), locale);
      setDetailSaveError(message);
      show(message, "error");
    } finally {
      setDetailSaving(false);
    }
  }

  async function handleDeleteEvent() {
    if (!detailDraft?.eventId || detailDeleting) return;
    const eventId = detailDraft.eventId;
    setDetailDeleting(true);
    try {
      await apiJson(`/api/events/${eventId}`, { method: "DELETE" });
      setEvents((prev) => prev.filter((e) => e.id !== eventId));
      setDetailOpen(false);
      setDetailDraft(null);
      if (activePet) await loadToday(activePet.id);
      show(t("recordUndone"), "info");
    } catch (err) {
      show(formatApiErrorMessage(err, t("recordError"), locale), "error");
    } finally {
      setDetailDeleting(false);
    }
  }

  const summaryLine = useMemo(() => {
    if (todaySummary.length === 0) return null;
    const parts = todaySummary.map((row) => `${t(row.label)} ${row.count}`);
    return parts.join(" · ");
  }, [todaySummary, t]);

  if (loading || !user || needsPet) return null;

  return (
    <main className="container today-page">
      <header className="today-header">
        <h1>{t("todayTitle")}</h1>
        {pets.length >= 2 && (
          <div className="pet-tabs" role="tablist" aria-label={t("homePetTabsLabel")}>
            {pets.map((pet) => (
              <button
                key={pet.id}
                type="button"
                role="tab"
                aria-selected={pet.id === activePet?.id}
                className={`pet-tab${pet.id === activePet?.id ? " pet-tab-active" : ""}`}
                onClick={() => void selectPet(pet)}
              >
                {pet.name}
              </button>
            ))}
          </div>
        )}
      </header>

      {summaryLine && <p className="today-summary meta">{summaryLine}</p>}

      <section className="today-timeline" aria-label={t("todayTimelineLabel")}>
        {dataLoading ? (
          <p className="meta">{t("loading")}</p>
        ) : loadError ? (
          <p className="error-text">{loadError}</p>
        ) : events.length === 0 ? (
          <p className="meta timeline-empty">{t("todayEmpty")}</p>
        ) : (
          <ul className="timeline-list">
            {events.map((event) => {
              const detail = eventDetailLine(event, t);
              return (
                <li key={event.id}>
                  <button
                    type="button"
                    className="timeline-item timeline-item-clickable"
                    onClick={() => openDetail(event)}
                  >
                    <time className="timeline-time" dateTime={event.occurredAt}>
                      {formatEventTime(event.occurredAt, locale)}
                    </time>
                    <div className="timeline-body">
                      <span className="timeline-label">{eventDisplayLabel(event, t)}</span>
                      {detail && <span className="timeline-detail">{detail}</span>}
                      {(event.attachments?.length ?? 0) > 0 && (
                        <div className="timeline-attachments">
                          <EventAttachmentThumb
                            path={event.attachments![0].path}
                            mime={event.attachments![0].mime}
                            alt=""
                            className="attachment-thumb attachment-thumb-inline"
                          />
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <EventDetailSheet
        open={detailOpen}
        draft={detailDraft}
        saving={detailSaving}
        deleting={detailDeleting}
        attachments={detailAttachments}
        pendingFiles={detailPendingFiles}
        onPendingFilesChange={setDetailPendingFiles}
        onDeleteEvent={detailDraft?.eventId ? () => void handleDeleteEvent() : undefined}
        onClose={() => {
          if (detailSaving) return;
          setDetailOpen(false);
          setDetailDraft(null);
          setDetailAttachments([]);
          setDetailPendingFiles([]);
          setDetailSaveError(null);
        }}
        onSave={(draft, meta) => void handleDetailSave(draft, meta)}
        saveError={detailSaveError}
        onValidationError={(message) => show(message, "error")}
        t={t}
        locale={locale}
      />
    </main>
  );
}
