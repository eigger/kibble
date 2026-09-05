"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { routePath } from "../../lib/base-path";
import { formatDoseTime, insertTimelineEvent, resolveDoseTimeOccurredAt } from "@kibble/shared";
import { apiJson } from "../../lib/api";
import { formatApiErrorMessage } from "../../lib/apiErrorMessage";
import { createEventWithOfflineFallback } from "../../lib/createEventOffline";
import { useAuth } from "../../lib/auth-context";
import { useLocale } from "../../lib/i18n/locale-context";
import { useToast } from "../../lib/toast-context";
import {
  clinicFieldsFromContact,
  eventDisplayLabel,
  formatEventTime,
} from "../../lib/eventDisplay";
import { EventCategoryTag } from "../../components/EventCategoryTag";
import { TimelineEventBody } from "../../components/TimelineEventBody";
import { MedicationCoursePickSheet } from "../../components/MedicationCoursePickSheet";
import {
  MedicationDoseSlotPickSheet,
  pendingDoseSlots,
} from "../../components/MedicationDoseSlotPickSheet";
import { EventDetailSheet, type EventDetailDraft } from "../../components/EventDetailSheet";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { PresetChip } from "../../components/PresetChip";
import { TimelineAttachmentThumbs } from "../../components/TimelineAttachmentThumbs";
import { AttachmentLightbox } from "../../components/AttachmentLightbox";
import {
  deleteEventAttachment,
} from "../../lib/eventAttachments";
import { startBackgroundUpload, cancelUploadsForEvent } from "../../lib/backgroundUpload";
import { useMergeUploadedAttachments } from "../../lib/useMergeUploadedAttachments";
import { groupPresetsByCategory } from "../../lib/presetGroups";
import type { CreatedEvent, DoseSlotToday, EventAttachment, Pet, Preset, TimelineEvent } from "../../lib/types";

interface ActiveMedicationCourse {
  id: string;
  name: string;
  dosesPerDay: number;
  doseTimes: string[];
  doseSlotsToday: DoseSlotToday[];
  dosesGivenToday: number;
}

interface QuickHomePayload {
  activePet: Pet | null;
  presets: Preset[];
  recentEvents: TimelineEvent[];
  activeMedicationCourses: ActiveMedicationCourse[];
}

const QUICK_RECENT_COUNT = 5;

function newDedupeKey(petId: string, presetId: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  const suffix = uuid ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `quick:${petId}:${presetId}:${suffix}`;
}

function createdEventToTimeline(event: CreatedEvent): TimelineEvent {
  return {
    id: event.id,
    occurredAt: event.occurredAt,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    quantity: event.quantity,
    quantityOffered: event.quantityOffered,
    unit: event.unit,
    scaleValue: event.scaleValue ?? null,
    productName: event.productName ?? null,
    costKrw: event.costKrw ?? null,
    contact: event.contact ?? null,
    course: event.course ?? null,
    note: event.note,
    preset: event.preset,
    eventType: {
      ...event.eventType,
      scaleType: event.eventType.scaleType ?? null,
    },
    attachments: event.attachments,
    createdBy: event.createdBy ?? null,
    updatedBy: event.updatedBy ?? null,
  };
}

export default function QuickRecordPage() {
  const router = useRouter();
  const pathname = routePath(usePathname());
  const { user, loading } = useAuth();
  const needsPet = user?.needsPet;
  const { t, locale } = useLocale();
  const { show } = useToast();
  const localeTag = locale === "ko" ? "ko-KR" : "en-US";
  const [pet, setPet] = useState<Pet | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [recentEvents, setRecentEvents] = useState<TimelineEvent[]>([]);
  const [activeMedicationCourses, setActiveMedicationCourses] = useState<ActiveMedicationCourse[]>(
    [],
  );
  const [dataLoading, setDataLoading] = useState(true);
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
  const [medPickOpen, setMedPickOpen] = useState(false);
  const [medSlotPickOpen, setMedSlotPickOpen] = useState(false);
  const [pendingMedPreset, setPendingMedPreset] = useState<Preset | null>(null);
  const [pendingMedCourse, setPendingMedCourse] = useState<ActiveMedicationCourse | null>(null);

  const presetGroups = useMemo(() => groupPresetsByCategory(presets), [presets]);
  const previewEvents = useMemo(
    () => recentEvents.slice(0, QUICK_RECENT_COUNT),
    [recentEvents],
  );
  const hasMoreRecent = recentEvents.length > QUICK_RECENT_COUNT;

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!loading && needsPet) router.push("/onboarding");
  }, [loading, needsPet, router]);

  const loadQuickData = useCallback(async () => {
    setDataLoading(true);
    setLoadError(null);
    try {
      const data = await apiJson<QuickHomePayload>("/api/home");
      setPet(data.activePet);
      setPresets(data.presets);
      setRecentEvents(data.recentEvents);
      setActiveMedicationCourses(data.activeMedicationCourses ?? []);
    } catch {
      setLoadError(t("quickRecordLoadError"));
      setPet(null);
      setPresets([]);
      setRecentEvents([]);
      setActiveMedicationCourses([]);
    } finally {
      setDataLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!user || needsPet || pathname !== "/q") return;
    void loadQuickData();
  }, [user, needsPet, pathname, loadQuickData]);

  useMergeUploadedAttachments(setRecentEvents);

  function openDetailFromEvent(event: TimelineEvent, edit = false) {
    if (!pet) return;
    setDetailSaveError(null);
    setDetailAttachments(event.attachments ?? []);
    setDetailPendingFiles([]);
    setDetailDraft({
      mode: edit ? "edit" : "view",
      eventId: event.id,
      petId: pet.id,
      presetId: event.preset?.id ?? null,
      eventTypeKey: event.eventType.key,
      label: eventDisplayLabel(event, t),
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
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
      createdByName: event.createdBy?.name ?? null,
      updatedByName: event.updatedBy?.name ?? null,
    });
    setDetailOpen(true);
  }

  function openDetailForNewPreset(
    preset: Preset,
    options?: {
      medicationCourseId?: string;
      medicationCourseName?: string;
      doseSlotIndex?: number;
      occurredAt?: string;
    },
  ) {
    if (!pet) return;
    const courseName = options?.medicationCourseName?.trim();
    const slotTime =
      options?.doseSlotIndex != null && options.medicationCourseId
        ? activeMedicationCourses.find((c) => c.id === options.medicationCourseId)?.doseTimes[
            options.doseSlotIndex
          ]
        : null;
    const slotLabel = slotTime ? formatDoseTime(slotTime, localeTag) : null;
    const labelParts = [t(preset.label)];
    if (courseName) labelParts.push(courseName);
    if (slotLabel) labelParts.push(slotLabel);
    const label = labelParts.join(" · ");

    setDetailSaveError(null);
    setDetailAttachments([]);
    setDetailPendingFiles([]);
    setDetailDraft({
      mode: "create",
      petId: pet.id,
      presetId: preset.id,
      eventTypeKey: preset.eventType?.key ?? null,
      label,
      occurredAt: options?.occurredAt ?? new Date().toISOString(),
      quantity: null,
      quantityOffered: null,
      unit: null,
      productName: null,
      clinicName: null,
      clinicAddress: null,
      clinicLatitude: null,
      clinicLongitude: null,
      clinicPlaceUrl: null,
      costKrw: null,
      note: null,
      scaleType: preset.eventType?.scaleType ?? null,
      scaleValue: null,
      dedupeKey: newDedupeKey(pet.id, preset.id),
      medicationCourseId: options?.medicationCourseId ?? null,
      doseSlotIndex: options?.doseSlotIndex ?? null,
    });
    setDetailOpen(true);
  }

  function continueMedicationPreset(
    preset: Preset,
    course: ActiveMedicationCourse,
    doseSlotIndex?: number,
  ) {
    if (course.dosesGivenToday >= course.dosesPerDay) {
      show(t("medicationTodayComplete"), "info");
      return;
    }

    let occurredAt = new Date().toISOString();
    if (
      doseSlotIndex != null &&
      course.doseTimes[doseSlotIndex] &&
      course.doseSlotsToday.length > 0
    ) {
      occurredAt = resolveDoseTimeOccurredAt(course.doseTimes[doseSlotIndex]).toISOString();
    }

    openDetailForNewPreset(preset, {
      medicationCourseId: course.id,
      medicationCourseName: course.name,
      doseSlotIndex,
      occurredAt,
    });
  }

  async function handleDetailSave(
    draft: EventDetailDraft,
    meta: { removedAttachmentIds: string[] },
  ) {
    // 오프라인 큐 항목에는 소유자가 필요하다 — 세션이 없으면 저장 자체를 하지 않는다.
    if (!user) return;

    setDetailSaving(true);
    setDetailSaveError(null);
    const filesToUpload = [...detailPendingFiles];

    try {
      if (!draft.eventId && draft.mode === "create") {
        const preset = presets.find((p) => p.id === draft.presetId);
        const outcome = await createEventWithOfflineFallback({
          userId: user.id,
          labelKey: preset?.label ?? draft.label,
          attachments: filesToUpload,
          body: {
            petId: draft.petId,
            presetId: draft.presetId ?? undefined,
            source: "QUICK",
            dedupeKey: draft.dedupeKey,
            occurredAt: draft.occurredAt,
            quantity: draft.quantity ?? undefined,
            quantityOffered: draft.quantityOffered ?? undefined,
            unit: draft.unit ?? undefined,
            productId: draft.productId ?? undefined,
            productName: draft.productName ?? undefined,
            clinicName: draft.clinicName ?? undefined,
            clinicAddress: draft.clinicAddress ?? undefined,
            clinicLatitude: draft.clinicLatitude ?? undefined,
            clinicLongitude: draft.clinicLongitude ?? undefined,
            clinicPlaceUrl: draft.clinicPlaceUrl ?? undefined,
            costKrw: draft.costKrw ?? undefined,
            note: draft.note ?? undefined,
            scaleValue: draft.scaleValue ?? undefined,
            medicationCourseId: draft.medicationCourseId ?? undefined,
            doseSlotIndex: draft.doseSlotIndex ?? undefined,
          },
        });

        if (outcome.status === "queued") {
          show(t("offlineQueuedToast"), "info");
          setDetailOpen(false);
          setDetailDraft(null);
          setDetailAttachments([]);
          setDetailPendingFiles([]);
          return;
        }

        const event = outcome.event;
        // 첨부보다 먼저 타임라인에 넣는다 — 업로드는 뒤에서 돌고, 끝나면
        // kibble-attachments-uploaded로 썸네일을 붙인다.
        setRecentEvents((prev) => insertTimelineEvent(prev, createdEventToTimeline(event)));
        setDetailOpen(false);
        setDetailDraft(null);
        setDetailAttachments([]);
        setDetailPendingFiles([]);
        show(t("eventDetailCreated"), "success");
        startBackgroundUpload(event.id, filesToUpload);
        return;
      }

      if (!draft.eventId) return;
      const updated = await apiJson<TimelineEvent>(`/api/events/${draft.eventId}`, {
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
          needsReview: false,
        }),
      });
      for (const attachmentId of meta.removedAttachmentIds) {
        await deleteEventAttachment(attachmentId);
      }
      const remainingAttachments = detailAttachments.filter(
        (a) => !meta.removedAttachmentIds.includes(a.id),
      );

      setRecentEvents((prev) =>
        prev.map((e) =>
          e.id === draft.eventId
            ? {
                ...e,
                ...updated,
                preset: e.preset,
                eventType: e.eventType,
                attachments: remainingAttachments,
              }
            : e,
        ),
      );
      setDetailOpen(false);
      setDetailDraft(null);
      setDetailAttachments([]);
      setDetailPendingFiles([]);
      show(t("eventDetailSaved"), "success");
      startBackgroundUpload(draft.eventId, filesToUpload);
    } catch (err) {
      const message = formatApiErrorMessage(err, t("recordError"), locale);
      setDetailSaveError(message);
      show(message, "error");
    } finally {
      setDetailSaving(false);
    }
  }

  async function deleteEvent(eventId: string) {
    if (deletingEventId) return;
    setDeletingEventId(eventId);
    cancelUploadsForEvent(eventId);
    try {
      await apiJson(`/api/events/${eventId}`, { method: "DELETE" });
      setRecentEvents((prev) => prev.filter((e) => e.id !== eventId));
      if (detailDraft?.eventId === eventId) {
        setDetailOpen(false);
        setDetailDraft(null);
        setDetailAttachments([]);
        setDetailPendingFiles([]);
        setDetailSaveError(null);
      }
      show(t("recordUndone"), "info");
    } catch (err) {
      show(formatApiErrorMessage(err, t("recordError"), locale), "error");
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

  function onPresetTap(preset: Preset) {
    if (!pet || detailSaving) return;
    if (preset.eventType?.key === "medication") {
      if (activeMedicationCourses.length === 0) {
        show(t("medicationNoActiveCourse"), "info");
        return;
      }
      setPendingMedPreset(preset);
      setMedPickOpen(true);
      return;
    }
    openDetailForNewPreset(preset);
  }

  if (loading || !user || needsPet) return null;

  return (
    <main className="quick-record-page">
      <div className="container quick-record-body">
        <header className="quick-record-header">
          <h1>{t("quickRecordTitle")}</h1>
          {pet && <p className="meta quick-record-pet">{pet.name}</p>}
        </header>

        <section className="quick-record-timeline" aria-label={t("quickRecordRecentTitle")}>
        {dataLoading ? (
          <p className="meta">{t("loading")}</p>
        ) : loadError ? (
          <p className="error-text">{loadError}</p>
        ) : previewEvents.length === 0 ? (
          <p className="meta timeline-empty">{t("quickRecordEmpty")}</p>
        ) : (
          <ul className="timeline-list">
            {previewEvents.map((event) => {
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
        )}
        {hasMoreRecent && (
          <p className="meta">
            <Link href="/history">{t("quickRecordMoreInHistory")}</Link>
          </p>
        )}
        <p className="meta home-timeline-hint">{t("quickRecordDetailHint")}</p>
      </section>
      </div>

      <footer className="home-input-bar quick-record-input-bar">
        <div className="home-input-bar-inner">
          <section className="home-quick-section" aria-label={t("homeQuickRecord")}>
            {presets.length > 0 ? (
              <div className="quick-chip-grid" role="group" aria-label={t("homeQuickRecord")}>
                {presetGroups.map((group) => (
                  <div key={group.category} className="quick-chip-row">
                    <span className="quick-chip-row-label">
                      <EventCategoryTag
                        category={group.category}
                        label={t(`presetCategoryShort.${group.category}`)}
                      />
                    </span>
                    <div className="quick-chip-row-chips">
                      {group.presets.map((preset) => (
                        <PresetChip
                          key={preset.id}
                          preset={preset}
                          label={t(preset.label)}
                          disabled={detailSaving || !pet}
                          tapOnly
                          compact
                          onTap={onPresetTap}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              !dataLoading && !loadError && <p className="meta home-no-chips">{t("homeNoPresets")}</p>
            )}
          </section>
        </div>
      </footer>

      <MedicationCoursePickSheet
        open={medPickOpen}
        courses={activeMedicationCourses}
        onClose={() => {
          setMedPickOpen(false);
          setPendingMedPreset(null);
        }}
        onPick={(courseId) => {
          const preset = pendingMedPreset;
          const course = activeMedicationCourses.find((c) => c.id === courseId);
          setMedPickOpen(false);
          if (!preset || !course) {
            setPendingMedPreset(null);
            return;
          }

          const pending = pendingDoseSlots(course.doseTimes, course.doseSlotsToday);
          if (pending.length > 1) {
            setPendingMedCourse(course);
            setMedSlotPickOpen(true);
            return;
          }

          setPendingMedPreset(null);
          continueMedicationPreset(preset, course, pending[0]?.index);
        }}
        t={t}
      />

      <MedicationDoseSlotPickSheet
        open={medSlotPickOpen}
        courseName={pendingMedCourse?.name ?? ""}
        slots={
          pendingMedCourse
            ? pendingDoseSlots(pendingMedCourse.doseTimes, pendingMedCourse.doseSlotsToday)
            : []
        }
        onClose={() => {
          setMedSlotPickOpen(false);
          setPendingMedCourse(null);
          setPendingMedPreset(null);
        }}
        onPick={(slotIndex) => {
          const preset = pendingMedPreset;
          const course = pendingMedCourse;
          setMedSlotPickOpen(false);
          setPendingMedCourse(null);
          setPendingMedPreset(null);
          if (preset && course) continueMedicationPreset(preset, course, slotIndex);
        }}
        t={t}
        locale={locale}
      />

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
