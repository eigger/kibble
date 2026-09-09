"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiJson, isApiError } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useLocale } from "../lib/i18n/locale-context";
import type { TranslationKey } from "../lib/i18n/translations";
import type { EventAttachment, Pet, TodaySummaryRow, TimelineEvent } from "../lib/types";
import type { JournalStats } from "@kibble/shared";
import { journalInsightMessage } from "@kibble/shared";
import { TimelineEventBody } from "../components/TimelineEventBody";
import { TimelineAttachmentThumbs } from "../components/TimelineAttachmentThumbs";
import { AttachmentLightbox } from "../components/AttachmentLightbox";
import { formatEventTime } from "../lib/eventDisplay";
import { formatScaleValuePart } from "../lib/eventDetailFields";
import { formatAmount, relativeSince, todayCardValue } from "../lib/todayCard";
import { useMergeUploadedAttachments } from "../lib/useMergeUploadedAttachments";
import { useVideoPosterRefresh } from "../lib/useVideoPosterRefresh";

/** `GET /api/home`이 내려주는 만큼만 — 과정 화면(`/care`)이 쓰는 전체 진행률이 아니다. */
interface HomeMedicationCourse {
  id: string;
  name: string;
  dosesPerDay: number;
  dosesGivenToday: number;
}

interface HomePayload {
  pets: Pet[];
  activePet: Pet | null;
  todaySummary: TodaySummaryRow[];
  recentEvents: TimelineEvent[];
  activeMedicationCourses: HomeMedicationCourse[];
  journalStats: JournalStats;
}

const PREVIEW_COUNT = 3;

/**
 * 홈이 곧 오늘이다 (§7.17). 카드가 내는 값은 이벤트 타입 키가 아니라 양·척도의
 * 유무로 갈린다 — 타입을 하나 늘릴 때 이 화면을 고쳐야 하면 모델이 틀린 것이다 (K-8).
 */
function TodayCard({
  row,
  t,
  label,
  locale,
}: {
  row: TodaySummaryRow;
  t: (key: TranslationKey, params?: Record<string, string>) => string;
  label: string;
  locale: string;
}) {
  const value = todayCardValue(row);
  const since = row.lastOccurredAt ? relativeSince(row.lastOccurredAt) : null;
  const scale = formatScaleValuePart(row.scaleType, row.lastScaleValue, t);

  const meta: string[] = [];
  if (row.lastOccurredAt) {
    // 앞선 시각으로 적어 둔 기록은 상대 시각이 거짓이 된다 — 그럴 때만 벽시계로 적는다.
    const when = since
      ? t(since.key, since.params)
      : formatEventTime(row.lastOccurredAt, locale);
    meta.push(t("homeTodayLast", { when }));
  }
  if (scale) meta.push(scale);

  return (
    <li className="today-card">
      <span className="today-card-label">{label}</span>
      <span className="today-card-value">
        {value.kind === "count" ? (
          t("homeTodayCount", { count: String(value.count) })
        ) : value.kind === "amount" ? (
          <>
            {formatAmount(value.value)}
            {value.unit && <span className="today-card-unit">{value.unit}</span>}
          </>
        ) : (
          <>
            {formatAmount(value.offered)}
            <span className="today-card-sep">/</span>
            {formatAmount(value.consumed)}
            {value.unit && <span className="today-card-unit">{value.unit}</span>}
          </>
        )}
      </span>
      {value.kind === "offeredConsumed" && (
        <span className="today-card-caption">
          {t("homeTodayOffered")} / {t("homeTodayConsumed")}
        </span>
      )}
      {meta.length > 0 && <span className="today-card-meta">{meta.join(" · ")}</span>}
    </li>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const userId = user?.id;
  const needsPet = user?.needsPet;
  const { t, tLabel, locale } = useLocale();

  const [pets, setPets] = useState<Pet[]>([]);
  const [activePet, setActivePet] = useState<Pet | null>(null);
  const [todaySummary, setTodaySummary] = useState<TodaySummaryRow[]>([]);
  const [recentEvents, setRecentEvents] = useState<TimelineEvent[]>([]);
  const [medicationCourses, setMedicationCourses] = useState<HomeMedicationCourse[]>([]);
  const [journalStats, setJournalStats] = useState<JournalStats>({
    totalEventCount: 0,
    distinctDayCount: 0,
  });
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rowLightboxAtt, setRowLightboxAtt] = useState<EventAttachment | null>(null);

  // 첨부는 이력 화면과 같게 다룬다 — 올라간 것을 제자리에 붙이고, 포스터가 늦은
  // 영상만 상태를 되묻는다. 목록을 통째로 다시 받지 않는다.
  useMergeUploadedAttachments(setRecentEvents);
  useVideoPosterRefresh(recentEvents, setRecentEvents);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!loading && needsPet) router.push("/onboarding");
  }, [loading, needsPet, router]);

  const loadHome = useCallback(async (petId?: string) => {
    const qs = petId ? `?petId=${encodeURIComponent(petId)}` : "";
    const data = await apiJson<HomePayload>(`/api/home${qs}`);
    setPets(data.pets);
    setActivePet(data.activePet);
    setTodaySummary(data.todaySummary);
    setRecentEvents(data.recentEvents);
    setMedicationCourses(data.activeMedicationCourses ?? []);
    setJournalStats(data.journalStats);
  }, []);

  useEffect(() => {
    if (!userId || needsPet) return;
    let cancelled = false;
    setDataLoading(true);
    setLoadError(null);
    (async () => {
      try {
        await loadHome();
      } catch (err) {
        if (cancelled) return;
        setPets([]);
        setActivePet(null);
        setTodaySummary([]);
        setRecentEvents([]);
        setMedicationCourses([]);
        if (isApiError(err)) {
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
      await loadHome(pet.id);
    } catch {
      setLoadError(t("homeLoadError"));
    } finally {
      setDataLoading(false);
    }
  }

  const journalInsight = useMemo(
    () => journalInsightMessage(journalStats, tLabel),
    [journalStats, tLabel],
  );

  const previewEvents = recentEvents.slice(0, PREVIEW_COUNT);
  const tabPanelId = activePet ? `home-pet-panel-${activePet.id}` : undefined;

  if (loading || !user || needsPet) {
    return (
      <main className="container">
        <p>{t("loading")}</p>
      </main>
    );
  }

  return (
    <main className="container home-dashboard">
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

      {dataLoading && !activePet ? (
        <p className="meta">{t("loading")}</p>
      ) : loadError ? (
        <p className="error-text">{loadError}</p>
      ) : (
        <div id={tabPanelId} role={pets.length >= 2 ? "tabpanel" : undefined}>
          <section className="dashboard-section" aria-labelledby="home-today-heading">
            <div className="dashboard-section-header">
              <h2 id="home-today-heading">{t("homeDashboardToday")}</h2>
              <Link href="/analytics" className="dashboard-link">
                {t("homeDashboardViewTrends")}
              </Link>
            </div>
            {todaySummary.length === 0 ? (
              <p className="meta home-dashboard-empty">{t("homeDashboardTodayEmpty")}</p>
            ) : (
              <ul className="today-grid">
                {todaySummary.map((row) => (
                  <TodayCard
                    key={row.eventTypeKey}
                    row={row}
                    t={t}
                    label={tLabel(row.label)}
                    locale={locale}
                  />
                ))}
              </ul>
            )}

            {medicationCourses.length > 0 && (
              <div className="today-medication">
                <h3 className="today-medication-heading">{t("homeTodayMedicationHeading")}</h3>
                <ul className="today-medication-list">
                  {medicationCourses.map((course) => {
                    const done = course.dosesGivenToday >= course.dosesPerDay;
                    return (
                      <li
                        key={course.id}
                        className={`today-medication-item${done ? " today-medication-done" : ""}`}
                      >
                        <span className="today-medication-name">{course.name}</span>
                        <span className="today-medication-progress">
                          {t("careTodayProgress", {
                            done: String(course.dosesGivenToday),
                            total: String(course.dosesPerDay),
                          })}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {journalInsight && <p className="home-journal-insight">{journalInsight}</p>}
          </section>

          <section className="dashboard-section" aria-labelledby="home-recent-heading">
            <div className="dashboard-section-header">
              <h2 id="home-recent-heading">{t("homeDashboardRecent")}</h2>
              <Link href="/history" className="dashboard-link">
                {t("homeDashboardViewHistory")}
              </Link>
            </div>
            {previewEvents.length === 0 ? (
              <p className="meta">{t("homeDashboardNoRecent")}</p>
            ) : (
              <ul className="timeline-list timeline-list-compact">
                {previewEvents.map((event) => {
                  return (
                    <li key={event.id}>
                      {/* 사진 버튼이 안에 있으므로 행은 링크가 아니다 — 앵커 안의 버튼은
                          중첩 대화형 요소가 된다. 이력 행과 같은 구조로 맞춘다. */}
                      <div
                        className="timeline-item timeline-item-clickable"
                        role="button"
                        tabIndex={0}
                        onClick={() => router.push("/history")}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter" && e.key !== " ") return;
                          e.preventDefault();
                          router.push("/history");
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
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

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
