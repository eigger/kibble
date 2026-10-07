"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { routePath } from "../../lib/base-path";
import { formatDoseTime, insertTimelineEvent, intlLocale } from "@kibble/shared";
import { apiJson, isApiError } from "../../lib/api";
import { scheduledDoseTime } from "../../lib/eventDetailFields";
import { formatApiErrorMessage } from "../../lib/apiErrorMessage";
import { createEventWithOfflineFallback } from "../../lib/createEventOffline";
import { createdEventToTimeline, isGroupedWithPrevious } from "../../lib/timeline";
import { useAuth } from "../../lib/auth-context";
import { useLocale } from "../../lib/i18n/locale-context";
import type { TranslationKey } from "../../lib/i18n/translations";
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
import {
  EventDetailSheet,
  type EventDetailDraft,
  type EventDetailSaveMeta,
} from "../../components/EventDetailSheet";
import { PresetChip } from "../../components/PresetChip";
import { RoutineButton } from "../../components/RoutineButton";
import {
  QUICK_MODE_TOGGLE_EVENT,
  buildRoutineEventBodies,
  isMedicationItem,
  runRoutineEvents,
  loadQuickMode,
  routineItemSummary,
  saveQuickMode,
  type QuickMode,
} from "../../lib/routines";
import {
  coursesActiveAt,
  loadCachedPetList,
  loadQuickHomeCache,
  saveQuickHomeCache,
  shouldUseQuickHomeCache,
  type UpcomingCourse,
} from "../../lib/quickHomeCache";
import { restoredEventBelongsToView } from "../../lib/restoreView";
import { deferOnce, type DeferredAction } from "../../lib/deferredAction";
import { isCourseDoneToday, planMedicationPick } from "../../lib/medicationPick";
import { fetchQuickHome, loadQuickPetId, saveQuickPetId } from "../../lib/quickPet";
import { TimelineAttachmentThumbs } from "../../components/TimelineAttachmentThumbs";
import { AttachmentLightbox } from "../../components/AttachmentLightbox";
import {
  deleteEventAttachment,
} from "../../lib/eventAttachments";
import { startBackgroundUpload, cancelUploadsForEvent } from "../../lib/backgroundUpload";
import { useMergeUploadedAttachments } from "../../lib/useMergeUploadedAttachments";
import { useVideoPosterRefresh } from "../../lib/useVideoPosterRefresh";
import { groupPresetsByCategory, presetCategoryShortKey } from "../../lib/presetGroups";
import type {
  CreatedEvent,
  DoseSlotToday,
  EventAttachment,
  Pet,
  Preset,
  Routine,
  RoutineItem,
  TimelineEvent,
} from "../../lib/types";

interface ActiveMedicationCourse {
  id: string;
  name: string;
  dosesPerDay: number;
  doseTimes: string[];
  doseSlotsToday: DoseSlotToday[];
  dosesGivenToday: number;
}

interface QuickHomePayload {
  pets?: Pet[];
  activePet: Pet | null;
  presets: Preset[];
  routines: Routine[];
  recentEvents: TimelineEvent[];
  activeMedicationCourses: ActiveMedicationCourse[];
  /** 시작 전 처방 최소 필드 — 오프라인 스냅샷용. 오늘 대상(`activeMedicationCourses`)과 별개다 */
  upcomingMedicationCourses?: UpcomingCourse[];
}

const QUICK_RECENT_COUNT = 5;

function randomSuffix(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function newDedupeKey(petId: string, presetId: string): string {
  return `quick:${petId}:${presetId}:${randomSuffix()}`;
}

/**
 * 여러 제품을 한 번에 기록할 때 이벤트들을 묶는 id (§7.22). 시트를 열 때 정해 두어야
 * 저장이 중간에 실패해 다시 눌러도 같은 묶음으로 들어간다 — 이벤트가 하나면 보내지 않는다.
 */
function newEntryId(): string {
  return `entry:${randomSuffix()}`;
}

export default function QuickRecordPage() {
  const router = useRouter();
  const pathname = routePath(usePathname());
  const { user, loading } = useAuth();
  const needsPet = user?.needsPet;
  // VIEWER는 읽기 전용 — 쓰기 컨트롤은 숨긴다 (서버가 403으로 막는 것을 눌러 보게 두지 않는다)
  const readOnly = user?.householdRole === "VIEWER";
  const { t, tLabel, locale, formatDateTime } = useLocale();
  const { show } = useToast();
  const localeTag = intlLocale(locale);
  const [pet, setPet] = useState<Pet | null>(null);
  const [pets, setPets] = useState<Pet[]>([]);
  // 비동기 콜백(실행취소)이 "지금 보고 있는" 반려동물을 읽는다
  const petRef = useRef<Pet | null>(null);
  useEffect(() => {
    petRef.current = pet;
  }, [pet]);
  // 저장해 둔 칩으로 그리는 중이면 저장 시각 — 타임라인은 비어 있다
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
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
  const [detailSaveError, setDetailSaveError] = useState<string | null>(null);
  const [detailAttachments, setDetailAttachments] = useState<EventAttachment[]>([]);
  const [detailPendingFiles, setDetailPendingFiles] = useState<File[]>([]);
  const [medPickOpen, setMedPickOpen] = useState(false);
  const [medSlotPickOpen, setMedSlotPickOpen] = useState(false);
  const [pendingMedPreset, setPendingMedPreset] = useState<Preset | null>(null);
  const [pendingMedCourse, setPendingMedCourse] = useState<ActiveMedicationCourse | null>(null);

  // 입력 바 모드 — 기록 칩 / 루틴 (§7.24). 루틴이 없으면 세그먼트도 없고 칩만 보인다.
  const [quickMode, setQuickMode] = useState<QuickMode>("chips");
  const [runningRoutineId, setRunningRoutineId] = useState<string | null>(null);
  const panelsRef = useRef<HTMLDivElement>(null);
  // 지운 행의 업로드 정리 — 실행취소 유예가 끝나면(또는 화면을 떠나면) 한 번 실행된다
  const pendingUploadCancels = useRef(new Map<string, DeferredAction>());
  const hasRoutines = routines.length > 0;

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

  // 화면을 떠나면 유예 중인 정리를 지금 한다 — 토스트도 함께 사라지므로 되돌릴 길이 없다
  useEffect(() => {
    const pending = pendingUploadCancels.current;
    return () => {
      [...pending.values()].forEach((action) => action.flush());
    };
  }, []);

  const userId = user?.id;
  const householdId = user?.householdId ?? null;

  const loadQuickData = useCallback(
    async (requestedPetId?: string | null, explicit = false) => {
      setDataLoading(true);
      setLoadError(null);
      try {
        const fetchHome = (petId?: string | null) =>
          apiJson<QuickHomePayload>(`/api/home${petId ? `?petId=${encodeURIComponent(petId)}` : ""}`);
        const data = await fetchQuickHome(fetchHome, requestedPetId ?? null);
        setPets(data.pets ?? []);
        setPet(data.activePet);
        setPresets(data.presets);
        setRoutines(data.routines ?? []);
        setRecentEvents(data.recentEvents);
        setActiveMedicationCourses(data.activeMedicationCourses ?? []);
        setCachedAt(null);
        // 탭으로 직접 고른 아이는 불러온 뒤에 기억한다 — 못 불러왔는데 기억하면 다음 시작이 막힌다
        if (explicit && data.activePet) saveQuickPetId(data.activePet.id);
        // 다음에 오프라인으로 열 때 쓸 스냅샷 — 칩·루틴·처방·반려동물만 (타임라인은 일부러 뺀다)
        if (userId && data.activePet) {
          saveQuickHomeCache(
            { userId, householdId },
            {
              pets: data.pets ?? [data.activePet],
              activePet: data.activePet,
              presets: data.presets,
              routines: data.routines ?? [],
              courses: data.activeMedicationCourses ?? [],
              upcomingCourses: data.upcomingMedicationCourses ?? [],
            },
          );
        }
      } catch (err) {
        // 네트워크·5xx만 저장해 둔 칩으로 그린다. 4xx(인증·권한·404)는 그대로 오류다
        const cached =
          userId && shouldUseQuickHomeCache(err)
            ? loadQuickHomeCache<Preset, Routine, ActiveMedicationCourse>(
                { userId, householdId },
                requestedPetId ?? null,
                { strict: explicit },
              )
            : null;
        if (cached) {
          setPets(cached.pets as Pet[]);
          setPet(cached.activePet as Pet);
          setPresets(cached.presets);
          setRoutines(cached.routines);
          setRecentEvents([]);
          // 오늘 몫 진행은 오래된 값이라 비운다 — 이미 먹였는지는 서버가 판정한다 (409)
          // 저장 뒤 시작일이 된 예정 처방도 활성으로 (서버와 같은 KST 날짜 규칙)
          setActiveMedicationCourses(
            coursesActiveAt(cached.courses, cached.upcomingCourses, new Date(), (c) => ({
              id: c.id,
              name: c.name,
              dosesPerDay: c.dosesPerDay,
              doseTimes: c.doseTimes,
              doseSlotsToday: [],
              dosesGivenToday: 0,
            })).map((c) => ({ ...c, doseSlotsToday: [], dosesGivenToday: 0 })),
          );
          setCachedAt(cached.savedAt);
          if (explicit) saveQuickPetId(cached.activePet.id);
        } else {
          setLoadError(t("quickRecordLoadError"));
          setCachedAt(null);
          // 요청한 아이의 스냅샷만 없을 수 있다 — 탭은 채워 스냅샷이 있는 다른 아이로 옮길 수 있게 한다
          setPets(
            userId && shouldUseQuickHomeCache(err)
              ? (loadCachedPetList({ userId, householdId }) as Pet[])
              : [],
          );
          setPet(null);
          setPresets([]);
          setRoutines([]);
          setRecentEvents([]);
          setActiveMedicationCourses([]);
        }
      } finally {
        setDataLoading(false);
      }
    },
    [t, userId, householdId],
  );

  function selectPet(next: Pet) {
    // 저장 진행 중에는 전환하지 않는다 — 끝난 POST의 결과가 다른 아이의 타임라인에 섞인다
    if (next.id === pet?.id || dataLoading || runningRoutineId || detailSaving) return;
    void loadQuickData(next.id, true);
  }

  useEffect(() => {
    if (!user || needsPet || pathname !== "/q") return;
    void loadQuickData(loadQuickPetId());
  }, [user, needsPet, pathname, loadQuickData]);

  // 저장해 둔 칩으로 그리거나 불러오기에 실패한 채 연결이 돌아오면 새로 받는다
  useEffect(() => {
    if (cachedAt == null && loadError == null) return;
    const onOnline = () => void loadQuickData(pet?.id ?? loadQuickPetId());
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [cachedAt, loadError, loadQuickData, pet?.id]);

  useMergeUploadedAttachments(setRecentEvents);
  useVideoPosterRefresh(recentEvents, setRecentEvents);

  useEffect(() => {
    setQuickMode(loadQuickMode());
  }, []);

  /** 세그먼트·내비 재탭 → 패널을 스크롤. 스크롤이 끝나면 아래 observer가 모드를 확정한다 */
  const scrollToMode = useCallback((mode: QuickMode) => {
    const panels = panelsRef.current;
    if (!panels) return;
    // 패널은 각각 컨테이너 폭 100%라 둘째 패널의 위치는 곧 폭이다
    const left = mode === "chips" ? 0 : panels.clientWidth;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    panels.scrollTo({ left, behavior: reduce ? "auto" : "smooth" });
  }, []);

  const selectMode = useCallback(
    (mode: QuickMode) => {
      setQuickMode(mode);
      saveQuickMode(mode);
      scrollToMode(mode);
    },
    [scrollToMode],
  );

  // 처음 그릴 때와 루틴이 생겼을 때 — 기억한 모드로 맞춘다 (스크롤 없이)
  useEffect(() => {
    if (!hasRoutines) return;
    const panels = panelsRef.current;
    if (panels) panels.scrollLeft = quickMode === "chips" ? 0 : panels.clientWidth;
    // quickMode를 의존성에 넣으면 사용자가 드래그한 직후에도 되돌린다 — 처음/루틴 생김에만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRoutines]);

  // 드래그로 넘겼을 때 — 어느 패널에 멈췄는지 보고 세그먼트·기억을 맞춘다
  useEffect(() => {
    const panels = panelsRef.current;
    if (!panels || !hasRoutines) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const mode = (entry.target as HTMLElement).dataset.quickMode as QuickMode | undefined;
          if (!mode) continue;
          setQuickMode((prev) => {
            if (prev !== mode) saveQuickMode(mode);
            return mode;
          });
        }
      },
      { root: panels, threshold: 0.6 },
    );
    panels.querySelectorAll<HTMLElement>("[data-quick-mode]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [hasRoutines]);

  // 하단 내비의 기록 탭을 여기서 다시 누르면 토글 (BottomNav). 시트가 열려 있으면 무시
  useEffect(() => {
    if (!hasRoutines) return;
    function onToggle() {
      if (detailOpen || medPickOpen || medSlotPickOpen) return;
      selectMode(quickMode === "chips" ? "routines" : "chips");
    }
    window.addEventListener(QUICK_MODE_TOGGLE_EVENT, onToggle);
    return () => window.removeEventListener(QUICK_MODE_TOGGLE_EVENT, onToggle);
  }, [hasRoutines, quickMode, detailOpen, medPickOpen, medSlotPickOpen, selectMode]);

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
      doseScheduledTime: scheduledDoseTime(event),
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
    const labelParts = [tLabel(preset.label)];
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
      entryId: newEntryId(),
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

    // 기록 시각은 누른 시각 — 슬롯 시각은 "언제 먹여야 하나"일 뿐이다 (§3.10)
    const occurredAt = new Date().toISOString();

    openDetailForNewPreset(preset, {
      medicationCourseId: course.id,
      medicationCourseName: course.name,
      doseSlotIndex,
      occurredAt,
    });
  }

  async function handleDetailSave(draft: EventDetailDraft, meta: EventDetailSaveMeta) {
    // 오프라인 큐 항목에는 소유자가 필요하다 — 세션이 없으면 저장 자체를 하지 않는다.
    if (!user) return;

    setDetailSaving(true);
    setDetailSaveError(null);
    const filesToUpload = [...detailPendingFiles];

    try {
      if (!draft.eventId && draft.mode === "create") {
        const preset = presets.find((p) => p.id === draft.presetId);
        const labelKey = preset?.label ?? draft.label;
        const extras = meta.extraItems;
        // 제품이 둘 이상이면 이벤트도 그만큼 — 같은 entryId로 묶는다 (§7.22). 하나면 지금과 같다
        const entryId = extras.length > 0 ? draft.entryId : undefined;
        const shared = {
          petId: draft.petId,
          presetId: draft.presetId ?? undefined,
          source: "QUICK" as const,
          occurredAt: draft.occurredAt,
          entryId,
        };

        // 둘째 제품부터 **먼저**, 첫 제품은 마지막에 만든다. 타임라인은 같은 시각이면 id 내림차순
        // (나중 것이 위)이라 이렇게 해야 시트에 보이던 순서(첫 제품 · 메모 · 첨부가 맨 위)로 읽힌다.
        // 메모·첨부는 첫 건에만. dedupeKey는 항목별이라 중간에 끊겨 다시 눌러도 이미 들어간 건은 그대로 돌아온다.
        const created: CreatedEvent[] = [];
        let queued = false;
        // 하나라도 만들어졌으면 실패해도 타임라인에는 넣는다 — 서버에 이미 있는 것을 화면만 모르면 안 된다
        const flushCreated = () => {
          if (created.length === 0) return;
          setRecentEvents((prev) =>
            created.reduce((acc, event) => insertTimelineEvent(acc, createdEventToTimeline(event)), prev),
          );
        };

        try {
          for (let i = extras.length - 1; i >= 0; i -= 1) {
            const item = extras[i];
            const extraOutcome = await createEventWithOfflineFallback({
              userId: user.id,
              labelKey,
              body: {
                ...shared,
                dedupeKey: draft.dedupeKey ? `${draft.dedupeKey}:${i + 1}` : undefined,
                quantity: item.quantity ?? undefined,
                quantityOffered: item.quantityOffered ?? undefined,
                unit: item.unit ?? undefined,
                productId: item.productId ?? undefined,
                productName: item.productName || undefined,
              },
            });
            if (extraOutcome.status === "queued") queued = true;
            else created.push(extraOutcome.event);
          }
        } catch (err) {
          flushCreated();
          throw err;
        }

        let outcome;
        try {
          outcome = await createEventWithOfflineFallback({
            userId: user.id,
            labelKey,
            attachments: filesToUpload,
            body: {
              ...shared,
              dedupeKey: draft.dedupeKey,
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
        } catch (err) {
          flushCreated();
          throw err;
        }
        if (outcome.status === "queued") queued = true;
        else created.push(outcome.event);

        // 첨부보다 먼저 타임라인에 넣는다 — 업로드는 뒤에서 돌고, 끝나면
        // kibble-attachments-uploaded로 썸네일을 붙인다.
        flushCreated();
        setDetailOpen(false);
        setDetailDraft(null);
        setDetailAttachments([]);
        setDetailPendingFiles([]);
        if (queued) {
          show(t("offlineQueuedToast"), "info");
        } else {
          show(
            created.length > 1
              ? t("eventDetailCreatedMany", { count: created.length })
              : t("eventDetailCreated"),
            "success",
          );
        }
        if (outcome.status === "created") startBackgroundUpload(outcome.event.id, filesToUpload);
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
          doseOrdinal: draft.doseOrdinal ?? null,
          needsReview: false,
        }),
      });
      if (meta.removedAttachmentIds.length > 0) {
        await Promise.all(meta.removedAttachmentIds.map((id) => deleteEventAttachment(id)));
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

  /**
   * 삭제는 묻지 않고 지운 뒤 "실행취소"를 준다 — 루틴과 같은 패턴이다. 확인 단계는 매번 1탭을
   * 더하지만, 실수는 3초 안에 되돌릴 수 있다. 복원은 `POST /events/:id/restore`(소프트 삭제 해제).
   */
  async function deleteEvent(eventId: string) {
    if (deletingEventId) return;
    const removed = recentEvents.find((e) => e.id === eventId) ?? null;
    setDeletingEventId(eventId);
    try {
      await apiJson(`/api/events/${eventId}`, { method: "DELETE" });
      // 업로드 정리는 실행취소 토스트가 닫힐 때로 미룬다 — 실수로 지운 행을 되돌리면 아직 안
      // 올라간 첨부가 이어서 올라가야 한다. 토스트는 호버·포커스 중 멈추므로 시간으로 맞추지 않고
      // 토스트의 닫힘(onClose)에 묶는다. 실행취소가 없는 삭제(removed 없음)는 바로 정리한다
      pendingUploadCancels.current.get(eventId)?.flush();
      pendingUploadCancels.current.set(
        eventId,
        deferOnce(() => {
          pendingUploadCancels.current.delete(eventId);
          cancelUploadsForEvent(eventId);
        }, null),
      );
      if (!removed) pendingUploadCancels.current.get(eventId)?.flush();
      setRecentEvents((prev) => prev.filter((e) => e.id !== eventId));
      if (detailDraft?.eventId === eventId) {
        setDetailOpen(false);
        setDetailDraft(null);
        setDetailAttachments([]);
        setDetailPendingFiles([]);
        setDetailSaveError(null);
      }
      show(
        t("eventDeleted"),
        "info",
        removed ? { label: t("undo"), onClick: () => void restoreEvent(removed) } : undefined,
        { onClose: () => pendingUploadCancels.current.get(eventId)?.flush() },
      );
    } catch (err) {
      show(formatApiErrorMessage(err, t("recordError"), locale), "error");
    } finally {
      setDeletingEventId(null);
    }
  }

  async function restoreEvent(event: TimelineEvent) {
    // 복원 요청이 도는 사이 유예 타이머가 만료돼 업로드가 취소되지 않게, 시작할 때 먼저 거둔다
    pendingUploadCancels.current.get(event.id)?.cancel();
    pendingUploadCancels.current.delete(event.id);
    try {
      const restored = await apiJson<{ petId?: string }>(`/api/events/${event.id}/restore`, {
        method: "POST",
      });
      // 삭제 뒤 다른 반려동물 탭으로 옮겼다면 이 화면에 끼워 넣지 않는다 (서버 복원은 성공)
      if (!restoredEventBelongsToView(restored?.petId, petRef.current?.id)) {
        show(t("eventRestoredOtherPet"), "success");
        return;
      }
      setRecentEvents((prev) =>
        prev.some((e) => e.id === event.id) ? prev : insertTimelineEvent(prev, event),
      );
      show(t("eventRestored"), "success");
    } catch (err) {
      // 오프라인·휴지통 만료(404) — 삭제는 이미 서버에 있다. 거뒀던 업로드 정리를 직접 한다
      cancelUploadsForEvent(event.id);
      show(formatApiErrorMessage(err, t("eventRestoreError"), locale), "error");
    }
  }

  function handleDeleteEvent() {
    if (!detailDraft?.eventId) return;
    void deleteEvent(detailDraft.eventId);
  }

  function handleRowDelete(event: TimelineEvent) {
    void deleteEvent(event.id);
  }

  /** 실행취소 — 방금 만든 N건을 전부 지운다. 토스트 하나로 끝낸다 */
  async function undoRoutine(eventIds: string[]) {
    try {
      await Promise.all(eventIds.map((id) => apiJson(`/api/events/${id}`, { method: "DELETE" })));
      setRecentEvents((prev) => prev.filter((e) => !eventIds.includes(e.id)));
      show(t("recordUndone"), "info");
    } catch (err) {
      show(formatApiErrorMessage(err, t("recordError"), locale), "error");
    }
  }

  /**
   * 루틴 1탭 — 항목마다 `POST /api/events` (K-4). 시트의 여러 제품 저장과 같은 순서·묶음 규칙(§7.22).
   * 중간에 실패해도 들어간 것은 타임라인에 넣는다 — 서버에 있는 것을 화면만 모르면 안 된다.
   */
  async function runRoutine(routine: Routine) {
    if (!user || !pet || runningRoutineId || detailSaving) return;
    if (routine.items.length === 0) return;

    const { events, skipped } = buildRoutineEventBodies(
      routine,
      pet.id,
      new Date().toISOString(),
      randomSuffix(),
    );
    // 오늘 몫을 이미 먹였다 — 서버가 409로 거절한다. 실패가 아니라 건너뜀이다 (§7.24)
    const alreadyGiven: RoutineItem[] = [];
    const names = (items: RoutineItem[]) =>
      items.map((item) => routineItemSummary(item, tLabel)).join(", ");
    const skipNotes = () => {
      const notes: string[] = [];
      if (skipped.length > 0) notes.push(t("routineSkippedEnded", { names: names(skipped) }));
      if (alreadyGiven.length > 0) {
        notes.push(t("routineSkippedGiven", { names: names(alreadyGiven) }));
      }
      return notes;
    };

    if (events.length === 0) {
      show(skipNotes().join(" · "), "info");
      return;
    }
    setRunningRoutineId(routine.id);

    // 항목 하나의 실패(보관된 칩 404 등)가 남은 항목을 막지 않는다 — 실패는 모아서 알린다
    let outcome: Awaited<ReturnType<typeof runRoutineEvents<CreatedEvent>>> | null = null;
    try {
      outcome = await runRoutineEvents<CreatedEvent>(
        events,
        ({ body }) =>
          createEventWithOfflineFallback({ userId: user.id, labelKey: routine.label, body }),
        (item, err) => isMedicationItem(item) && isApiError(err) && err.status === 409,
      );
    } finally {
      if (outcome && outcome.created.length > 0) {
        setRecentEvents((prev) =>
          outcome!.created.reduce(
            (acc, event) => insertTimelineEvent(acc, createdEventToTimeline(event)),
            prev,
          ),
        );
      }
      setRunningRoutineId(null);
    }
    if (!outcome) return;

    const { created, queued, failed } = outcome;
    alreadyGiven.push(...outcome.alreadyGiven);
    const ids = created.map((e) => e.id);

    if (failed.length > 0) {
      // 들어간 건은 되돌릴 수 있어야 한다 — 실패 토스트에 실행취소를 붙인다
      const summary = t("routineFailedItems", { names: names(failed.map((f) => f.item)) });
      const reason = formatApiErrorMessage(failed[0].error, t("recordError"), locale);
      // 일부가 오프라인 큐에 남았거나 건너뛴 항목이 있으면 같은 토스트에 함께 알린다
      const parts = [`${summary} · ${reason}`];
      if (queued) parts.push(t("offlineQueuedToast"));
      parts.push(...skipNotes());
      show(
        parts.join(" · "),
        "error",
        ids.length > 0 ? { label: t("undo"), onClick: () => void undoRoutine(ids) } : undefined,
      );
      return;
    }
    if (queued) {
      show(t("offlineQueuedToast"), "info");
      return;
    }
    const notes = skipNotes();
    if (created.length === 0) {
      if (notes.length > 0) show(notes.join(" · "), "info");
      return;
    }
    const saved = t("routineSavedToast", { label: routine.label, count: ids.length });
    show([saved, ...notes].join(" "), "success", {
      label: t("undo"),
      onClick: () => void undoRoutine(ids),
    });
  }

  /** 처방이 정해졌다 — 남은 슬롯이 여럿이면 시간대를, 하나면 바로 상세 시트로 */
  function chooseMedicationCourse(preset: Preset, course: ActiveMedicationCourse) {
    const pending = pendingDoseSlots(course.doseTimes, course.doseSlotsToday);
    if (pending.length > 1) {
      setPendingMedPreset(preset);
      setPendingMedCourse(course);
      setMedSlotPickOpen(true);
      return;
    }
    setPendingMedPreset(null);
    continueMedicationPreset(preset, course, pending[0]?.index);
  }

  function onPresetTap(preset: Preset) {
    if (!pet || detailSaving) return;
    if (preset.eventType?.key === "medication") {
      if (activeMedicationCourses.length === 0) {
        show(t("medicationNoActiveCourse"), "info");
        return;
      }
      const plan = planMedicationPick(activeMedicationCourses);
      if (plan.kind === "allDone") {
        show(t("medicationTodayComplete"), "info");
        return;
      }
      // 오늘 남은 처방이 하나뿐이면 묻지 않는다 — 탭 하나를 아낀다
      if (plan.kind === "auto") {
        chooseMedicationCourse(preset, plan.course);
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
          {cachedAt != null && (
            <p className="meta" role="status">
              {t("quickCachedNotice", { time: formatDateTime(new Date(cachedAt).toISOString()) })}
            </p>
          )}
          {pets.length >= 2 ? (
            <div className="pet-tabs" role="tablist" aria-label={t("homePetTabsLabel")}>
              {pets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={p.id === pet?.id}
                  className={`pet-tab${p.id === pet?.id ? " pet-tab-active" : ""}`}
                  onClick={() => selectPet(p)}
                >
                  {p.name}
                </button>
              ))}
            </div>
          ) : (
            pet && <p className="meta quick-record-pet">{pet.name}</p>
          )}
        </header>

        <section className="quick-record-timeline" aria-label={t("quickRecordRecentTitle")}>
        {dataLoading ? (
          <p className="meta">{t("loading")}</p>
        ) : loadError ? (
          <div>
            <p className="error-text">{loadError}</p>
            <button
              type="button"
              className="secondary"
              onClick={() => void loadQuickData(pet?.id ?? loadQuickPetId())}
            >
              {t("retryButton")}
            </button>
          </div>
        ) : cachedAt != null ? (
          <p className="meta timeline-empty">{t("quickCachedTimeline")}</p>
        ) : previewEvents.length === 0 ? (
          <p className="meta timeline-empty">{t("quickRecordEmpty")}</p>
        ) : (
          <ul className="timeline-list">
            {previewEvents.map((event, index) => {
              const grouped = isGroupedWithPrevious(previewEvents, index);
              return (
                <li key={event.id} className={`timeline-row${grouped ? " timeline-row-grouped" : ""}`}>
                  <div
                    className={`timeline-item${readOnly ? "" : " timeline-item-clickable"}`}
                    role={readOnly ? undefined : "button"}
                    tabIndex={readOnly ? undefined : 0}
                    onClick={readOnly ? undefined : () => openDetailFromEvent(event)}
                    onKeyDown={(e) => {
                      if (readOnly) return;
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      openDetailFromEvent(event);
                    }}
                  >
                    <time className="timeline-time" dateTime={event.occurredAt}>
                      {grouped ? "" : formatEventTime(event.occurredAt, locale)}
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
                  {!readOnly && (
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
                  )}
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
        {!readOnly && <p className="meta home-timeline-hint">{t("quickRecordDetailHint")}</p>}
      </section>
      </div>

      {readOnly ? (
        <footer className="home-input-bar quick-record-input-bar">
          <div className="home-input-bar-inner">
            <p className="meta">{t("quickViewerReadOnly")}</p>
          </div>
        </footer>
      ) : (
      <footer className="home-input-bar quick-record-input-bar">
        <div className="home-input-bar-inner">
          {hasRoutines && (
            <div className="quick-mode-bar">
              <div className="quick-mode-switch" role="tablist" aria-label={t("quickModeLabel")}>
                <button
                  type="button"
                  role="tab"
                  id="quick-mode-tab-chips"
                  aria-selected={quickMode === "chips"}
                  aria-controls="quick-panel-chips"
                  className={quickMode === "chips" ? "active" : ""}
                  onClick={() => selectMode("chips")}
                >
                  {t("quickModeChips")}
                </button>
                <button
                  type="button"
                  role="tab"
                  id="quick-mode-tab-routines"
                  aria-selected={quickMode === "routines"}
                  aria-controls="quick-panel-routines"
                  className={quickMode === "routines" ? "active" : ""}
                  onClick={() => selectMode("routines")}
                >
                  {t("quickModeRoutines")}
                </button>
              </div>
              <Link href="/routines" className="quick-mode-manage">
                {t("routinesManageLink")}
              </Link>
            </div>
          )}
          <div ref={panelsRef} className={`quick-panels${hasRoutines ? " quick-panels-snap" : ""}`}>
          <section
            id="quick-panel-chips"
            className="home-quick-section quick-panel"
            data-quick-mode="chips"
            role={hasRoutines ? "tabpanel" : undefined}
            aria-labelledby={hasRoutines ? "quick-mode-tab-chips" : undefined}
            aria-label={hasRoutines ? undefined : t("homeQuickRecord")}
          >
            {presets.length > 0 ? (
              <div className="quick-chip-grid" role="group" aria-label={t("homeQuickRecord")}>
                {presetGroups.map((group) => (
                  <div key={group.category} className="quick-chip-row">
                    <span className="quick-chip-row-label">
                      <EventCategoryTag
                        category={group.category}
                        label={t(presetCategoryShortKey(group.category))}
                      />
                    </span>
                    <div className="quick-chip-row-chips">
                      {group.presets.map((preset) => (
                        <PresetChip
                          key={preset.id}
                          preset={preset}
                          label={tLabel(preset.label)}
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
          {hasRoutines && (
            <section
              id="quick-panel-routines"
              className="quick-panel quick-routine-panel"
              data-quick-mode="routines"
              role="tabpanel"
              aria-labelledby="quick-mode-tab-routines"
            >
              <div className="routine-grid">
                {routines.map((routine) => (
                  <RoutineButton
                    key={routine.id}
                    routine={routine}
                    tLabel={tLabel}
                    disabled={
                      !pet ||
                      detailSaving ||
                      (runningRoutineId != null && runningRoutineId !== routine.id)
                    }
                    running={runningRoutineId === routine.id}
                    runningLabel={t("saving")}
                    amountLabels={{ offered: t("homeTodayOffered"), consumed: t("homeTodayConsumed") }}
                    onTap={(r) => void runRoutine(r)}
                  />
                ))}
              </div>
            </section>
          )}
          </div>
        </div>
      </footer>
      )}

      <MedicationCoursePickSheet
        open={medPickOpen}
        courses={activeMedicationCourses.map((c) => ({
          id: c.id,
          name: c.name,
          done: isCourseDoneToday(c),
        }))}
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
          chooseMedicationCourse(preset, course);
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
        petSpecies={pet?.species ?? null}
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

    </main>
  );
}
