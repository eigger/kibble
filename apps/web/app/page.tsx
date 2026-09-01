"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiJson, isApiError } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useLocale } from "../lib/i18n/locale-context";
import type { Pet, TodaySummaryRow, TimelineEvent } from "../lib/types";
import type { JournalStats } from "@kibble/shared";
import { journalInsightMessage } from "@kibble/shared";
import { EventCategoryTag } from "../components/EventCategoryTag";
import {
  eventCategory,
  eventCategoryLabel,
  eventDetailLine,
  eventDisplayLabel,
  formatEventTime,
} from "../lib/eventDisplay";

interface HomePayload {
  pets: Pet[];
  activePet: Pet | null;
  todaySummary: TodaySummaryRow[];
  recentEvents: TimelineEvent[];
  journalStats: JournalStats;
}

const PREVIEW_COUNT = 3;

export default function HomePage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const userId = user?.id;
  const needsPet = user?.needsPet;
  const { t, locale } = useLocale();

  const [pets, setPets] = useState<Pet[]>([]);
  const [activePet, setActivePet] = useState<Pet | null>(null);
  const [todaySummary, setTodaySummary] = useState<TodaySummaryRow[]>([]);
  const [recentEvents, setRecentEvents] = useState<TimelineEvent[]>([]);
  const [journalStats, setJournalStats] = useState<JournalStats>({
    totalEventCount: 0,
    distinctDayCount: 0,
  });
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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
    () => journalInsightMessage(journalStats, t),
    [journalStats, t],
  );

  const todayTotal = useMemo(
    () => todaySummary.reduce((sum, row) => sum + row.count, 0),
    [todaySummary],
  );

  const daysLoggedLabel = useMemo(() => {
    if (journalStats.distinctDayCount >= 4) {
      return t("homeStatsDaysMany", { days: String(journalStats.distinctDayCount) });
    }
    if (journalStats.distinctDayCount === 0) return t("homeStatsDaysNone");
    return t("homeStatsDays", { days: String(journalStats.distinctDayCount) });
  }, [journalStats.distinctDayCount, t]);

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
            <h2 id="home-today-heading">{t("homeDashboardToday")}</h2>
            {todaySummary.length === 0 ? (
              <p className="meta home-dashboard-empty">{t("homeDashboardTodayEmpty")}</p>
            ) : (
              <>
                <p className="home-dashboard-total meta">
                  {t("homeDashboardTodayTotal", { count: String(todayTotal) })}
                </p>
                <ul className="summary-grid">
                  {todaySummary.map((row) => (
                    <li key={row.eventTypeKey} className="summary-card">
                      <span className="summary-card-count">{row.count}</span>
                      <span className="summary-card-label">{t(row.label)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="dashboard-section" aria-labelledby="home-stats-heading">
            <div className="dashboard-section-header">
              <h2 id="home-stats-heading">{t("homeDashboardPatterns")}</h2>
              <Link href="/analytics" className="dashboard-link">
                {t("homeDashboardViewTrends")}
              </Link>
            </div>
            <div className="stats-row">
              <div className="stat-card">
                <span className="stat-card-value">{journalStats.totalEventCount}</span>
                <span className="stat-card-label">{t("homeStatsTotalEvents")}</span>
              </div>
              <div className="stat-card">
                <span className="stat-card-value">{daysLoggedLabel}</span>
                <span className="stat-card-label">{t("homeStatsDaysLabel")}</span>
              </div>
            </div>
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
                  const detail = eventDetailLine(event, t);
                  return (
                    <li key={event.id}>
                      <Link href="/history" className="timeline-item timeline-item-link">
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
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
