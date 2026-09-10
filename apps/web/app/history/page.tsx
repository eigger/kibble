"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiJson } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useLocale } from "../../lib/i18n/locale-context";
import { useToast } from "../../lib/toast-context";
import type { MedicationCourseRow, Pet, TimelineEvent } from "../../lib/types";
import type { JournalStats } from "@kibble/shared";
import { appendTimelinePage, intlLocale, kstDayKey, timelineHasMore } from "@kibble/shared";
import {
  clinicFieldsFromContact,
  eventDisplayLabel,
  formatEventTime,
} from "../../lib/eventDisplay";
import { formatApiErrorMessage } from "../../lib/apiErrorMessage";
import { EventDetailSheet, type EventDetailDraft } from "../../components/EventDetailSheet";
import { TimelineEventBody } from "../../components/TimelineEventBody";
import { TimelineAttachmentThumbs } from "../../components/TimelineAttachmentThumbs";
import { AttachmentLightbox } from "../../components/AttachmentLightbox";
import { HistoryPeriodFilter } from "../../components/HistoryPeriodFilter";
import { HistoryTypeFilter } from "../../components/HistoryTypeFilter";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import {
  deleteEventAttachment,
} from "../../lib/eventAttachments";
import { startBackgroundUpload, cancelUploadsForEvent } from "../../lib/backgroundUpload";
import { useMergeUploadedAttachments } from "../../lib/useMergeUploadedAttachments";
import { useVideoPosterRefresh } from "../../lib/useVideoPosterRefresh";
import { fetchTimelinePage } from "../../lib/timeline";
import type { EventAttachment } from "../../lib/types";

interface HistoryBootstrap {
  pets: Pet[];
  activePet: Pet | null;
}

/**
 * 처방 하나의 복약 기록만 보는 필터. 케어의 처방 상세에서 `/history?pet=…&course=…`로 들어온다.
 * 칩에 이름·기간을 그리려고 처방을 한 번 읽는다 — URL에 이름을 실어 보내지 않는다.
 */
type CourseFilter = Pick<MedicationCourseRow, "id" | "name" | "startDate">;

// 같은 이름("아침약")의 처방이 여럿이라 시작일로 구분한다. 종료일은 케어의 지난 처방이
// 마지막 복약 기준으로 그리므로 여기서 다른 값을 또 말하지 않는다.
function courseFilterStart(course: CourseFilter, locale: "ko" | "en"): string {
  return new Date(course.startDate).toLocaleDateString(intlLocale(locale), {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    timeZone: "Asia/Seoul",
  });
}

export default function HistoryPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const needsPet = user?.needsPet;
  const { t, tLabel, locale } = useLocale();
  const { show } = useToast();

  const [pets, setPets] = useState<Pet[]>([]);
  const [activePet, setActivePet] = useState<Pet | null>(null);
  const [periodFilter, setPeriodFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState<CourseFilter | null>(null);
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
  const [highlightEventId, setHighlightEventId] = useState<string | null>(null);

  const loadSeq = useRef(0);
  const loadMoreSeq = useRef(0);
  const eventsRef = useRef<TimelineEvent[]>([]);
  const petIdRef = useRef<string | null>(null);
  const periodRef = useRef("");
  const typeRef = useRef("");
  const courseRef = useRef("");
  const loadingMoreRef = useRef(false);
  const scrolledHighlightRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const hl = params.get("highlight");
    if (hl) {
      setHighlightEventId(hl);
    }
  }, []);


  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useMergeUploadedAttachments(setEvents);
  useVideoPosterRefresh(events, setEvents);

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
    async (
      petId: string,
      period: string,
      eventTypeKey: string,
      medicationCourseId: string,
      reset: boolean,
    ) => {
      const seq = ++loadSeq.current;
      if (reset) {
        loadMoreSeq.current += 1;
        setDataLoading(true);
        setLoadError(null);
      }

      try {
        const page = await fetchTimelinePage(
          petId,
          undefined,
          undefined,
          period || undefined,
          eventTypeKey || undefined,
          medicationCourseId || undefined,
        );
        if (seq !== loadSeq.current) return;
        petIdRef.current = petId;
        periodRef.current = period;
        typeRef.current = eventTypeKey;
        courseRef.current = medicationCourseId;
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
        // 케어의 처방 상세에서 온 링크 — 그 펫·그 처방으로 시작한다
        const params = new URLSearchParams(window.location.search);
        const petParam = params.get("pet")?.trim() || undefined;
        const courseParam = params.get("course")?.trim() || "";

        const pet = await loadBootstrap(petParam);
        if (cancelled || !pet) return;

        if (courseParam) {
          try {
            const course = await apiJson<MedicationCourseRow>(
              `/api/care/medication-courses/${encodeURIComponent(courseParam)}`,
            );
            if (cancelled) return;
            if (course.petId === pet.id) {
              // 필터를 세우면 아래 필터 effect가 첫 페이지를 받는다 — 여기서 또 받지 않는다
              setCourseFilter(course);
              return;
            }
          } catch {
            // 없는 처방이면 필터 없이 이력을 그린다 (K-12)
          }
        }
        await loadEvents(pet.id, periodFilter, typeFilter, "", true);
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
    void loadEvents(activePet.id, periodFilter, typeFilter, courseFilter?.id ?? "", true);
  }, [periodFilter, typeFilter, courseFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function selectPet(pet: Pet) {
    if (pet.id === activePet?.id || dataLoading) return;
    setActivePet(pet);
    // 처방은 펫 하나의 것이라 펫을 바꾸면 필터도 내린다
    if (courseFilter) {
      clearCourseFilter();
      return;
    }
    await loadEvents(pet.id, periodFilter, typeFilter, "", true);
  }

  function clearCourseFilter() {
    setCourseFilter(null);
    router.replace("/history");
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
        typeRef.current || undefined,
        courseRef.current || undefined,
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
      const label = new Date(event.occurredAt).toLocaleDateString(intlLocale(locale), {
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
      label: eventDisplayLabel(event, tLabel),
      occurredAt: event.occurredAt,
      quantity: event.quantity,
      quantityOffered: event.quantityOffered,
      unit: event.unit,
      productId: event.productId ?? null,
      product: event.product ?? null,
      productName: event.productName,
      ...clinicFieldsFromContact(event),
      costKrw: event.costKrw,
      note: event.note,
      scaleType: event.eventType.scaleType ?? null,
      scaleValue: event.scaleValue,
      medicationCourseId: event.course?.id ?? null,
      doseAmount: event.course?.dosage ?? null,
      doseOrdinal: event.doseOrdinal ?? null,
      doseTotal: event.course?.totalDoses ?? null,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
      createdByName: event.createdBy?.name ?? null,
      updatedByName: event.updatedBy?.name ?? null,
    });
    setDetailOpen(true);
  }

  useEffect(() => {
    if (!highlightEventId || events.length === 0 || !activePet) return;
    if (scrolledHighlightRef.current === highlightEventId) return;

    const foundEvent = events.find((e) => e.id === highlightEventId);
    if (foundEvent) {
      scrolledHighlightRef.current = highlightEventId;
      const targetEl = document.getElementById(`event-${highlightEventId}`);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      openDetailFromEvent(foundEvent);
      const timer = setTimeout(() => {
        setHighlightEventId(null);
      }, 2600);
      return () => clearTimeout(timer);
    }

    scrolledHighlightRef.current = highlightEventId;
    apiJson<TimelineEvent>(`/api/events/${encodeURIComponent(highlightEventId)}`)
      .then((fetched) => {
        if (fetched) {
          openDetailFromEvent(fetched);
        }
      })
      .catch(() => {})
      .finally(() => {
        setHighlightEventId(null);
      });
  }, [highlightEventId, events, activePet]);

  async function deleteEvent(eventId: string) {
    if (deletingEventId) return;
    setDeletingEventId(eventId);
    cancelUploadsForEvent(eventId);
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
          productId: draft.productId ?? null,
          productName: draft.productName,
          clinicName: draft.clinicName,
          clinicAddress: draft.clinicAddress,
          clinicLatitude: draft.clinicLatitude ?? null,
          clinicLongitude: draft.clinicLongitude ?? null,
          clinicPlaceUrl: draft.clinicPlaceUrl ?? null,
          costKrw: draft.costKrw,
          note: draft.note,
          scaleValue: draft.scaleValue ?? null,
          doseOrdinal: draft.doseOrdinal ?? null,
          needsReview: false,
        }),
      });
      if (meta.removedAttachmentIds.length > 0) {
        await Promise.all(meta.removedAttachmentIds.map((id) => deleteEventAttachment(id)));
      }
      setDetailOpen(false);
      setDetailDraft(null);
      setDetailPendingFiles([]);
      show(t("eventDetailSaved"), "success");
      startBackgroundUpload(draft.eventId, filesToUpload);
      if (activePet) {
        void loadEvents(activePet.id, periodFilter, typeFilter, courseFilter?.id ?? "", true);
      }
    } catch (err) {
      const message = formatApiErrorMessage(err, t("recordError"), locale);
      setDetailSaveError(message);
      show(message, "error");
    } finally {
      setDetailSaving(false);
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
        <>
          <HistoryPeriodFilter
            value={periodFilter}
            onChange={setPeriodFilter}
            t={t}
            petId={activePet.id}
          />
          <div className="history-type-filter">
            <HistoryTypeFilter
              value={typeFilter}
              onChange={setTypeFilter}
              t={t}
              tLabel={tLabel}
            />
          </div>
          {courseFilter && (
            <div className="history-course-chip">
              <span className="history-course-chip-label">
                {t("historyCourseFilter", { name: courseFilter.name })}
                <span className="meta"> · {courseFilterStart(courseFilter, locale)} ~</span>
              </span>
              <button
                type="button"
                className="history-course-chip-clear"
                aria-label={t("historyCourseFilterClear")}
                onClick={clearCourseFilter}
              >
                ✕
              </button>
            </div>
          )}
        </>
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
                    return (
                      <li
                        key={event.id}
                        id={`event-${event.id}`}
                        className={`timeline-row${highlightEventId === event.id ? " timeline-row-highlight" : ""}`}
                      >
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
                          <TimelineEventBody event={event}>
                            {(event.attachments?.length ?? 0) > 0 && (
                              <TimelineAttachmentThumbs
                                attachments={event.attachments ?? []}
                                onOpen={setRowLightboxAtt}
                              />
                            )}
                          </TimelineEventBody>
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
