"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { formatDoseTime, insertTimelineEvent, resolveDoseTimeOccurredAt } from "@kibble/shared";
import { apiJson } from "../../lib/api";
import { formatApiErrorMessage } from "../../lib/apiErrorMessage";
import { createEventWithOfflineFallback } from "../../lib/createEventOffline";
import { useAuth } from "../../lib/auth-context";
import { useLocale } from "../../lib/i18n/locale-context";
import { useToast } from "../../lib/toast-context";
import {
  eventCategory,
  eventCategoryLabel,
  clinicFieldsFromContact,
  eventDetailLine,
  eventDisplayLabel,
  formatEventTime,
} from "../../lib/eventDisplay";
import { EventCategoryTag } from "../../components/EventCategoryTag";
import { MedicationCoursePickSheet } from "../../components/MedicationCoursePickSheet";
import {
  MedicationDoseSlotPickSheet,
  pendingDoseSlots,
} from "../../components/MedicationDoseSlotPickSheet";
import { EventDetailSheet, type EventDetailDraft } from "../../components/EventDetailSheet";
import { PresetChip } from "../../components/PresetChip";
import { EventAttachmentThumb } from "../../components/EventAttachmentThumb";
import {
  deleteEventAttachment,
  uploadEventAttachments,
} from "../../lib/eventAttachments";
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

function newDedupeKey(petId: string, presetId: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  const suffix = uuid ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `quick:${petId}:${presetId}:${suffix}`;
}

function createdEventToTimeline(event: CreatedEvent): TimelineEvent {
  return {
    id: event.id,
    occurredAt: event.occurredAt,
    quantity: event.quantity,
    quantityOffered: event.quantityOffered,
    unit: event.unit,
    scaleValue: event.scaleValue ?? null,
    productName: event.productName ?? null,
    contact: event.contact ?? null,
    course: event.course ?? null,
    note: event.note,
    preset: event.preset,
    eventType: {
      ...event.eventType,
      scaleType: event.eventType.scaleType ?? null,
    },
    attachments: event.attachments,
  };
}

export default function QuickRecordPage() {
  const router = useRouter();
  const pathname = usePathname();
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
  const [detailDraft, setDetailDraft] = useState<EventDetailDraft | null>(null);
  const [detailSaving, setDetailSaving] = useState(false);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [detailSaveError, setDetailSaveError] = useState<string | null>(null);
  const [detailAttachments, setDetailAttachments] = useState<EventAttachment[]>([]);
  const [detailPendingFiles, setDetailPendingFiles] = useState<File[]>([]);
  const [medPickOpen, setMedPickOpen] = useState(false);
  const [medSlotPickOpen, setMedSlotPickOpen] = useState(false);
  const [pendingMedPreset, setPendingMedPreset] = useState<Preset | null>(null);
  const [pendingMedCourse, setPendingMedCourse] = useState<ActiveMedicationCourse | null>(null);

  const presetGroups = useMemo(() => groupPresetsByCategory(presets), [presets]);

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

  function mergeEventAttachments(eventId: string, uploaded: EventAttachment[]) {
    if (uploaded.length === 0) return;
    setRecentEvents((prev) =>
      prev.map((e) =>
        e.id === eventId
          ? { ...e, attachments: [...(e.attachments ?? []), ...uploaded] }
          : e,
      ),
    );
    setDetailAttachments((prev) => [...prev, ...uploaded]);
  }

  async function uploadFilesToEvent(
    eventId: string,
    files: File[],
    onRemaining: (remaining: File[]) => void,
  ): Promise<boolean> {
    if (files.length === 0) return true;
    const { uploaded, remaining } = await uploadEventAttachments(eventId, files);
    if (uploaded.length > 0) mergeEventAttachments(eventId, uploaded);
    if (remaining.length > 0) {
      onRemaining(remaining);
      show(t("attachmentUploadPartial"), "error");
      return false;
    }
    return true;
  }

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
      productName: event.productName,
      ...clinicFieldsFromContact(event),
      note: event.note,
      scaleType: event.eventType.scaleType ?? null,
      scaleValue: event.scaleValue,
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
    setDetailSaving(true);
    setDetailSaveError(null);
    const filesToUpload = [...detailPendingFiles];

    try {
      if (!draft.eventId && draft.mode === "create") {
        const preset = presets.find((p) => p.id === draft.presetId);
        const outcome = await createEventWithOfflineFallback({
          labelKey: preset?.label ?? draft.label,
          body: {
            petId: draft.petId,
            presetId: draft.presetId ?? undefined,
            source: "QUICK",
            dedupeKey: draft.dedupeKey,
            occurredAt: draft.occurredAt,
            quantity: draft.quantity ?? undefined,
            quantityOffered: draft.quantityOffered ?? undefined,
            unit: draft.unit ?? undefined,
            productName: draft.productName ?? undefined,
            clinicName: draft.clinicName ?? undefined,
            clinicAddress: draft.clinicAddress ?? undefined,
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
        if (filesToUpload.length > 0) {
          const attachmentsOk = await uploadFilesToEvent(
            event.id,
            filesToUpload,
            setDetailPendingFiles,
          );
          if (attachmentsOk) setDetailPendingFiles([]);
        }

        setRecentEvents((prev) => insertTimelineEvent(prev, createdEventToTimeline(event)));
        setDetailOpen(false);
        setDetailDraft(null);
        setDetailAttachments([]);
        show(t("eventDetailSaved"), "success");
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
          productName: draft.productName,
          clinicName: draft.clinicName,
          clinicAddress: draft.clinicAddress,
          note: draft.note,
          scaleValue: draft.scaleValue ?? null,
          needsReview: false,
        }),
      });
      let attachmentsOk = true;
      if (filesToUpload.length > 0) {
        attachmentsOk = await uploadFilesToEvent(draft.eventId, filesToUpload, setDetailPendingFiles);
        if (attachmentsOk) setDetailPendingFiles([]);
      }
      if (!attachmentsOk) return;

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
      show(t("eventDetailSaved"), "success");
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

  async function handleDeleteEvent() {
    if (!detailDraft?.eventId) return;
    if (!confirm(t("confirmDeleteEvent"))) return;
    await deleteEvent(detailDraft.eventId);
  }

  function handleRowDelete(event: TimelineEvent) {
    if (deletingEventId) return;
    if (!confirm(t("confirmDeleteEvent"))) return;
    void deleteEvent(event.id);
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
    <main className="container quick-record-page">
      <header className="quick-record-header">
        <h1>{t("quickRecordTitle")}</h1>
        {pet && <p className="meta quick-record-pet">{pet.name}</p>}
      </header>

      <section className="quick-record-timeline" aria-label={t("quickRecordRecentTitle")}>
        {dataLoading ? (
          <p className="meta">{t("loading")}</p>
        ) : loadError ? (
          <p className="error-text">{loadError}</p>
        ) : recentEvents.length === 0 ? (
          <p className="meta timeline-empty">{t("quickRecordEmpty")}</p>
        ) : (
          <ul className="timeline-list">
            {recentEvents.map((event) => {
              const detail = eventDetailLine(event, t);
              return (
                <li key={event.id} className="timeline-row">
                  <button
                    type="button"
                    className="timeline-item timeline-item-clickable"
                    onClick={() => openDetailFromEvent(event)}
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
        <p className="meta home-timeline-hint">{t("quickRecordDetailHint")}</p>
      </section>

      <footer className="home-input-bar">
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
