"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiJson } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useLocale } from "../../lib/i18n/locale-context";
import { useToast } from "../../lib/toast-context";
import type { Pet, TimelineEvent } from "../../lib/types";
import type { JournalStats } from "@kibble/shared";
import { appendTimelinePage, kstDayKey, timelineHasMore } from "@kibble/shared";
import {
  eventCategory,
  eventCategoryLabel,
  clinicFieldsFromContact,
  eventDetailLine,
  eventDisplayLabel,
  formatEventTime,
} from "../../lib/eventDisplay";
import { formatApiErrorMessage } from "../../lib/apiErrorMessage";
import { EventCategoryTag } from "../../components/EventCategoryTag";
import { EventDetailSheet, type EventDetailDraft } from "../../components/EventDetailSheet";
import { TimelineAttachmentThumbs } from "../../components/TimelineAttachmentThumbs";
import { AttachmentLightbox } from "../../components/AttachmentLightbox";
import { HistoryPeriodFilter } from "../../components/HistoryPeriodFilter";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import {
  deleteEventAttachment,
  uploadEventAttachments,
  type AttachmentUploadProgress,
} from "../../lib/eventAttachments";
import { fetchTimelinePage } from "../../lib/timeline";
import type { EventAttachment } from "../../lib/types";

interface HistoryBootstrap {
  pets: Pet[];
  activePet: Pet | null;
}

export default function HistoryPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const needsPet = user?.needsPet;
  const { t, locale } = useLocale();
  const { show } = useToast();

  const [pets, setPets] = useState<Pet[]>([]);
  const [activePet, setActivePet] = useState<Pet | null>(null);
  const [periodFilter, setPeriodFilter] = useState("");
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  // 이력 행 사진을 바로 눌렀을 때 — 상세 시트를 거치지 않고 라이트박스만 연다.
  const [rowLightboxAtt, setRowLightboxAtt] = useState<EventAttachment | null>(null);
  const [detailDraft, setDetailDraft] = useState<EventDetailDraft | null>(null);
  const [detailSaving, setDetailSaving] = useState(false);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [deleteConfirmEventId, setDeleteConfirmEventId] = useState<string | null>(null);
  const [detailSaveError, setDetailSaveError] = useState<string | null>(null);
  const [detailAttachments, setDetailAttachments] = useState<EventAttachment[]>([]);
  const [detailPendingFiles, setDetailPendingFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<AttachmentUploadProgress | null>(null);

  const loadSeq = useRef(0);
  const loadMoreSeq = useRef(0);
  const eventsRef = useRef<TimelineEvent[]>([]);
  const petIdRef = useRef<string | null>(null);
  const periodRef = useRef("");
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!loading && needsPet) router.push("/onboarding");
  }, [loading, needsPet, router]);

  const loadBootstrap = useCallback(async (petId?: string) => {
    const qs = petId ? `?petId=${encodeURIComponent(petId)}` : "";
    const data = await apiJson<HistoryBootstrap & { journalStats?: JournalStats }>(`/api/home${qs}`);
    setPets(data.pets);
    setActivePet(data.activePet);
    return data.activePet;
  }, []);

  const loadEvents = useCallback(
    async (petId: string, period: string, reset: boolean) => {
      const seq = ++loadSeq.current;
      if (reset) {
        loadMoreSeq.current += 1;
        setDataLoading(true);
        setLoadError(null);
      }

      try {
        const page = await fetchTimelinePage(petId, undefined, undefined, period || undefined);
        if (seq !== loadSeq.current) return;
        petIdRef.current = petId;
        periodRef.current = period;
        setEvents(page);
        setHasMore(timelineHasMore(page.length));
      } catch (err) {
        if (seq !== loadSeq.current) return;
        if (err instanceof ApiError && err.status === 401) {
          router.push("/login");
          return;
        }
        setEvents([]);
        setHasMore(false);
        setLoadError(t("historyLoadError"));
      } finally {
        if (seq === loadSeq.current && reset) setDataLoading(false);
      }
    },
    [router, t],
  );

  useEffect(() => {
    if (!user || needsPet) return;
    let cancelled = false;
    (async () => {
      try {
        const pet = await loadBootstrap();
        if (cancelled || !pet) return;
        await loadEvents(pet.id, periodFilter, true);
      } catch {
        if (!cancelled) setLoadError(t("historyLoadError"));
      }
    })();
    return () => {
      cancelled = true;
    };
    // 부트스트랩 전용 effect다. periodFilter를 의존성에 넣으면 필터를 바꿀 때마다 펫 조회부터
    // 다시 돈다 — 필터 변경은 아래 effect가 따로 처리한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, needsPet, loadBootstrap, loadEvents, t]);

  useEffect(() => {
    if (!activePet) return;
    void loadEvents(activePet.id, periodFilter, true);
  }, [periodFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function selectPet(pet: Pet) {
    if (pet.id === activePet?.id || dataLoading) return;
    setActivePet(pet);
    await loadEvents(pet.id, periodFilter, true);
  }

  const loadMore = useCallback(async () => {
    const petId = petIdRef.current;
    if (!petId || loadingMoreRef.current || !hasMore) return;
    const last = eventsRef.current[eventsRef.current.length - 1];
    if (!last) return;

    const seq = ++loadMoreSeq.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await fetchTimelinePage(
        petId,
        { occurredAt: last.occurredAt, id: last.id },
        undefined,
        periodRef.current || undefined,
      );
      if (seq !== loadMoreSeq.current || petId !== petIdRef.current) return;
      setEvents((prev) => appendTimelinePage(prev, page).events);
      setHasMore(timelineHasMore(page.length));
    } catch {
      if (seq !== loadMoreSeq.current) return;
      show(t("timelineLoadMoreError"), "error");
    } finally {
      if (seq === loadMoreSeq.current) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [hasMore, show, t]);

  const groupedEvents = useMemo(() => {
    const groups: { dayKey: string; label: string; items: TimelineEvent[] }[] = [];
    for (const event of events) {
      const dayKey = kstDayKey(new Date(event.occurredAt));
      const label = new Date(event.occurredAt).toLocaleDateString(locale === "ko" ? "ko-KR" : "en-US", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "Asia/Seoul",
      });
      const last = groups[groups.length - 1];
      if (last?.dayKey === dayKey) {
        last.items.push(event);
      } else {
        groups.push({ dayKey, label, items: [event] });
      }
    }
    return groups;
  }, [events, locale]);

  function openDetailFromEvent(event: TimelineEvent, edit = false) {
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
      costKrw: event.costKrw,
      note: event.note,
      scaleType: event.eventType.scaleType ?? null,
      scaleValue: event.scaleValue,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
      createdByName: event.createdBy?.name ?? null,
      updatedByName: event.updatedBy?.name ?? null,
    });
    setDetailOpen(true);
  }

  async function deleteEvent(eventId: string) {
    if (deletingEventId) return;
    setDeletingEventId(eventId);
    try {
      await apiJson(`/api/events/${eventId}`, { method: "DELETE" });
      setEvents((prev) => prev.filter((e) => e.id !== eventId));
      if (detailDraft?.eventId === eventId) {
        setDetailOpen(false);
        setDetailDraft(null);
        setDetailAttachments([]);
        setDetailPendingFiles([]);
        setDetailSaveError(null);
      }
      show(t("recordUndone"), "success");
    } catch {
      show(t("recordError"), "error");
    } finally {
      setDeletingEventId(null);
    }
  }

  function requestDelete(eventId: string) {
    if (deletingEventId) return;
    setDeleteConfirmEventId(eventId);
  }

  async function confirmDelete() {
    if (!deleteConfirmEventId) return;
    const eventId = deleteConfirmEventId;
    setDeleteConfirmEventId(null);
    await deleteEvent(eventId);
  }

  function handleDeleteEvent() {
    if (!detailDraft?.eventId) return;
    requestDelete(detailDraft.eventId);
  }

  function handleRowDelete(event: TimelineEvent) {
    requestDelete(event.id);
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
          clinicLatitude: draft.clinicLatitude ?? null,
          clinicLongitude: draft.clinicLongitude ?? null,
          clinicPlaceUrl: draft.clinicPlaceUrl ?? null,
          costKrw: draft.costKrw,
          note: draft.note,
          scaleValue: draft.scaleValue ?? null,
          needsReview: false,
        }),
      });
      if (filesToUpload.length > 0) {
        const { uploaded, remaining } = await uploadEventAttachments(
          draft.eventId,
          filesToUpload,
          setUploadProgress,
        );
        if (uploaded.length > 0) {
          setDetailAttachments((prev) => [...prev, ...uploaded]);
          // 목록도 같이 채운다 — 부분 실패로 아래 loadEvents까지 못 가면
          // 시트를 닫았을 때 목록 썸네일만 비어 보인다
          setEvents((prev) =>
            prev.map((e) =>
              e.id === draft.eventId
                ? { ...e, attachments: [...(e.attachments ?? []), ...uploaded] }
                : e,
            ),
          );
        }
        if (remaining.length > 0) {
          setDetailPendingFiles(remaining);
          show(t("attachmentUploadPartial"), "error");
          return;
        }
        setDetailPendingFiles([]);
      }
      for (const attachmentId of meta.removedAttachmentIds) {
        await deleteEventAttachment(attachmentId);
      }
      if (activePet) await loadEvents(activePet.id, periodFilter, true);
      setDetailOpen(false);
      setDetailDraft(null);
      show(t("eventDetailSaved"), "success");
    } catch (err) {
      const message = formatApiErrorMessage(err, t("recordError"), locale);
      setDetailSaveError(message);
      show(message, "error");
    } finally {
      setDetailSaving(false);
      setUploadProgress(null);
    }
  }

  const tabPanelId = activePet ? `history-pet-panel-${activePet.id}` : undefined;

  if (loading || !user || needsPet) {
    return (
      <main className="container">
        <p>{t("loading")}</p>
      </main>
    );
  }

  return (
    <main className="container history-page">
      <header className="history-header">
        <h1>{t("historyTitle")}</h1>
        {pets.length >= 2 && (
          <div className="pet-tabs" role="tablist" aria-label={t("homePetTabsLabel")}>
            {pets.map((pet) => (
              <button
                key={pet.id}
                type="button"
                role="tab"
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

      {activePet && (
        <HistoryPeriodFilter
          value={periodFilter}
          onChange={setPeriodFilter}
          t={t}
          petId={activePet.id}
        />
      )}

      <section
        className="history-events-section"
        id={tabPanelId}
        role={pets.length >= 2 ? "tabpanel" : undefined}
      >
        {dataLoading && events.length === 0 ? (
          <p className="meta">{t("loading")}</p>
        ) : loadError ? (
          <p className="error-text">{loadError}</p>
        ) : events.length === 0 ? (
          <p className="meta history-empty">{t("historyEmpty")}</p>
        ) : (
          <>
            {groupedEvents.map((group) => (
              <div key={group.dayKey} className="history-day-group">
                <h2 className="history-day-heading">{group.label}</h2>
                <ul className="timeline-list">
                  {group.items.map((event) => {
                    const detail = eventDetailLine(event, t);
                    return (
                      <li key={event.id} className="timeline-row">
                        <div
                          className="timeline-item timeline-item-clickable"
                          role="button"
                          tabIndex={0}
                          onClick={() => openDetailFromEvent(event)}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter" && e.key !== " ") return;
                            e.preventDefault();
                            openDetailFromEvent(event);
                          }}
                        >
                          <time className="timeline-time" dateTime={event.occurredAt}>
                            {formatEventTime(event.occurredAt, locale)}
                          </time>
                          <div className="timeline-body">
                            <div className="timeline-label-row">
                              <EventCategoryTag
                                category={eventCategory(event)}
                                label={eventCategoryLabel(event, t)}
                              />
                              <span className="timeline-label">{eventDisplayLabel(event, t)}</span>
                            </div>
                            {detail && <span className="timeline-detail">{detail}</span>}
                            {(event.attachments?.length ?? 0) > 0 && (
                              <TimelineAttachmentThumbs
                                attachments={event.attachments ?? []}
                                onOpen={setRowLightboxAtt}
                              />
                            )}
                          </div>
                        </div>
                        <div className="timeline-row-actions">
                          <button
                            type="button"
                            className="btn-action"
                            aria-label={t("edit")}
                            disabled={deletingEventId === event.id}
                            onClick={() => openDetailFromEvent(event, true)}
                          >
                            {t("edit")}
                          </button>
                          <button
                            type="button"
                            className="btn-action btn-action-danger"
                            aria-label={t("delete")}
                            disabled={deletingEventId === event.id}
                            onClick={() => handleRowDelete(event)}
                          >
                            {deletingEventId === event.id ? t("deleting") : t("delete")}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {hasMore && (
              <button
                type="button"
                className="secondary history-load-more"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore ? t("timelineLoadingMore") : t("loadMore")}
              </button>
            )}
          </>
        )}
      </section>

      <EventDetailSheet
        open={detailOpen}
        draft={detailDraft}
        saving={detailSaving}
        deleting={detailDraft?.eventId != null && deletingEventId === detailDraft.eventId}
        attachments={detailAttachments}
        pendingFiles={detailPendingFiles}
        onPendingFilesChange={setDetailPendingFiles}
        uploadProgress={uploadProgress}
        onDeleteEvent={detailDraft?.eventId ? handleDeleteEvent : undefined}
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

      {rowLightboxAtt && (
        <AttachmentLightbox
          path={rowLightboxAtt.path}
          mime={rowLightboxAtt.mime}
          onClose={() => setRowLightboxAtt(null)}
          closeLabel={t("close")}
          resetLabel={t("lightboxResetZoom")}
        />
      )}

      <ConfirmDialog
        open={deleteConfirmEventId != null}
        title={t("confirmDeleteEvent")}
        confirmLabel={deletingEventId ? t("deleting") : t("delete")}
        cancelLabel={t("cancel")}
        danger
        busy={deletingEventId != null}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteConfirmEventId(null)}
      />
    </main>
  );
}
