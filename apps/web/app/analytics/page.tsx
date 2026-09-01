"use client";

import { useCallback, useEffect, useMemo, useRef, useState, cloneElement, type ReactElement } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiJson } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { fetchAnalyticsEvents } from "../../lib/fetchAnalyticsEvents";
import { useLocale } from "../../lib/i18n/locale-context";
import {
  avgDailyQuantity,
  filterEventsByPeriod,
  granularityForPeriod,
  groupedQuantitySums,
  groupedScaleAverage,
  latestWeight,
  type AnalyticsPeriod,
  weightChartPoints,
} from "../../lib/petMetrics";
import type { Pet } from "../../lib/types";
import "./analytics.css";

interface HomePetsPayload {
  pets: Pet[];
  activePet: Pet | null;
}

const PERIODS: { value: AnalyticsPeriod; labelKey: string }[] = [
  { value: "1w", labelKey: "analyticsPeriod1w" },
  { value: "1m", labelKey: "analyticsPeriod1m" },
  { value: "6m", labelKey: "analyticsPeriod6m" },
  { value: "1y", labelKey: "analyticsPeriod1y" },
  { value: "all", labelKey: "analyticsPeriodAll" },
];

const CHART_HEIGHT_COMPACT = 212;
const CHART_HEIGHT_TALL = 248;
const CHART_MARGIN = { top: 8, right: 8, left: 0, bottom: 0 };
const TOOLTIP_CURSOR = { fill: "color-mix(in srgb, var(--color-primary) 10%, transparent)" };

function chartXAxisProps(dataLength: number) {
  const dense = dataLength > 6;
  return {
    tick: { fontSize: 10, fill: "var(--color-text-muted)" },
    interval: dense ? ("preserveStartEnd" as const) : (0 as const),
    minTickGap: dense ? 14 : 8,
    angle: dense ? -32 : 0,
    textAnchor: dense ? ("end" as const) : ("middle" as const),
    height: dense ? 52 : 32,
  };
}

function AnalyticsChart({
  tall,
  children,
}: {
  tall?: boolean;
  children: ReactElement<{ width?: number; height?: number }>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const height = tall ? CHART_HEIGHT_TALL : CHART_HEIGHT_COMPACT;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.floor(el.getBoundingClientRect().width));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`analytics-chart-wrap${tall ? " analytics-chart-wrap--tall" : " analytics-chart-wrap--compact"}`}
    >
      {width > 0 ? cloneElement(children, { width, height }) : null}
    </div>
  );
}

function ChartEmpty({
  title,
  desc,
  inPeriod,
  t,
}: {
  title: string;
  desc?: string;
  inPeriod: boolean;
  t: (key: string) => string;
}) {
  return (
    <div className="analytics-chart-empty">
      <p className="analytics-chart-empty-title">
        {inPeriod ? t("analyticsNoDataInPeriod") : title}
      </p>
      {!inPeriod && desc && <p className="meta">{desc}</p>}
    </div>
  );
}

export default function AnalyticsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const needsPet = user?.needsPet;
  const { t, locale } = useLocale();
  const localeTag = locale === "ko" ? "ko-KR" : "en-US";

  const [pets, setPets] = useState<Pet[]>([]);
  const [activePet, setActivePet] = useState<Pet | null>(null);
  const [events, setEvents] = useState<Awaited<ReturnType<typeof fetchAnalyticsEvents>>>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [period, setPeriod] = useState<AnalyticsPeriod>("1m");

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!loading && needsPet) router.push("/onboarding");
  }, [loading, needsPet, router]);

  const loadPetEvents = useCallback(async (petId: string) => {
    setDataLoading(true);
    setLoadError(null);
    try {
      const rows = await fetchAnalyticsEvents(petId);
      setEvents(rows);
    } catch {
      setEvents([]);
      setLoadError(t("analyticsLoadError"));
    } finally {
      setDataLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!user || needsPet) return;
    void (async () => {
      try {
        const data = await apiJson<HomePetsPayload>("/api/home");
        setPets(data.pets);
        setActivePet(data.activePet);
        if (data.activePet) await loadPetEvents(data.activePet.id);
        else setDataLoading(false);
      } catch {
        setLoadError(t("analyticsLoadError"));
        setDataLoading(false);
      }
    })();
  }, [user, needsPet, loadPetEvents, t]);

  async function selectPet(pet: Pet) {
    if (pet.id === activePet?.id || dataLoading) return;
    setActivePet(pet);
    await loadPetEvents(pet.id);
  }

  const filtered = useMemo(() => filterEventsByPeriod(events, period), [events, period]);
  const granularity = granularityForPeriod(period);
  const hasAnyData = events.length > 0;

  const weightPoints = useMemo(
    () => weightChartPoints(filtered, localeTag),
    [filtered, localeTag],
  );
  const mealGrouped = useMemo(
    () => groupedQuantitySums(filtered, "meal", granularity, localeTag, { includeOffered: true }),
    [filtered, granularity, localeTag],
  );
  const waterGrouped = useMemo(
    () => groupedQuantitySums(filtered, "water", granularity, localeTag),
    [filtered, granularity, localeTag],
  );
  const stoolGrouped = useMemo(
    () => groupedScaleAverage(filtered, "poop", granularity, localeTag),
    [filtered, granularity, localeTag],
  );

  const summaryWeight = latestWeight(filtered);
  const summaryMeal = avgDailyQuantity(filtered, "meal");
  const summaryWater = avgDailyQuantity(filtered, "water");

  if (loading || !user || needsPet) return null;

  return (
    <main className="container analytics-page">
      <header className="care-header">
        <h1>{t("analyticsHeading")}</h1>
        {pets.length >= 2 && activePet && (
          <div className="pet-tabs" role="tablist" aria-label={t("homePetTabsLabel")}>
            {pets.map((pet) => (
              <button
                key={pet.id}
                type="button"
                role="tab"
                aria-selected={pet.id === activePet.id}
                className={`pet-tab${pet.id === activePet.id ? " pet-tab-active" : ""}`}
                onClick={() => void selectPet(pet)}
              >
                {pet.name}
              </button>
            ))}
          </div>
        )}
        <div className="analytics-period-row" role="group" aria-label={t("analyticsHeading")}>
          {PERIODS.map(({ value, labelKey }) => (
            <button
              key={value}
              type="button"
              className={`analytics-period-btn${period === value ? " analytics-period-btn-active" : ""}`}
              onClick={() => setPeriod(value)}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
      </header>

      {dataLoading ? (
        <p className="meta">{t("loading")}</p>
      ) : loadError ? (
        <p className="error-text">{loadError}</p>
      ) : !activePet ? (
        <p className="meta">{t("analyticsEmptyTitle")}</p>
      ) : (
        <>
          <section className="card">
            <div className="analytics-summary-grid">
              <div>
                <div className="analytics-summary-label">{t("analyticsLatestWeight")}</div>
                <div className="analytics-summary-value">
                  {summaryWeight != null ? `${summaryWeight}kg` : "—"}
                </div>
              </div>
              <div>
                <div className="analytics-summary-label">{t("analyticsAvgMeal")}</div>
                <div className="analytics-summary-value">
                  {summaryMeal != null ? `${summaryMeal}g` : "—"}
                </div>
              </div>
              <div>
                <div className="analytics-summary-label">{t("analyticsAvgWater")}</div>
                <div className="analytics-summary-value">
                  {summaryWater != null ? `${summaryWater}ml` : "—"}
                </div>
              </div>
            </div>
          </section>

          <section className="card analytics-chart-card">
            <h2 className="analytics-chart-title">{t("analyticsWeightChartTitle")}</h2>
            {weightPoints.length === 0 ? (
              <ChartEmpty
                title={t("analyticsEmptyTitle")}
                desc={t("analyticsEmptyDesc")}
                inPeriod={hasAnyData}
                t={t}
              />
            ) : (
              <AnalyticsChart>
                <ComposedChart
                  data={weightPoints}
                  margin={{ ...CHART_MARGIN, bottom: weightPoints.length > 6 ? 8 : 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="label" {...chartXAxisProps(weightPoints.length)} />
                  <YAxis
                    tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
                    width={40}
                    tickMargin={4}
                  />
                  <Tooltip
                    formatter={(value) => [`${value} kg`, t("analyticsWeightChartTitle")]}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    cursor={TOOLTIP_CURSOR}
                  />
                  <Line
                    type="monotone"
                    dataKey="weight"
                    stroke="var(--color-primary)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </AnalyticsChart>
            )}
          </section>

          <section className="card analytics-chart-card">
            <h2 className="analytics-chart-title">{t("analyticsMealChartTitle")}</h2>
            {mealGrouped.length === 0 ? (
              <ChartEmpty
                title={t("analyticsEmptyTitle")}
                desc={t("analyticsEmptyDesc")}
                inPeriod={hasAnyData}
                t={t}
              />
            ) : (
              <AnalyticsChart tall>
                <BarChart
                  data={mealGrouped}
                  margin={{ ...CHART_MARGIN, bottom: mealGrouped.length > 6 ? 8 : 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="label" {...chartXAxisProps(mealGrouped.length)} />
                  <YAxis
                    tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
                    width={40}
                    tickMargin={4}
                  />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} cursor={TOOLTIP_CURSOR} />
                  <Legend
                    verticalAlign="bottom"
                    align="center"
                    wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  />
                  <Bar
                    dataKey="offered"
                    name={t("analyticsMealOfferedLegend")}
                    fill="var(--chart-secondary)"
                    maxBarSize={28}
                  />
                  <Bar
                    dataKey="consumed"
                    name={t("analyticsMealConsumedLegend")}
                    fill="var(--color-primary)"
                    maxBarSize={28}
                  />
                </BarChart>
              </AnalyticsChart>
            )}
          </section>

          <section className="card analytics-chart-card">
            <h2 className="analytics-chart-title">{t("analyticsWaterChartTitle")}</h2>
            {waterGrouped.length === 0 ? (
              <ChartEmpty
                title={t("analyticsEmptyTitle")}
                desc={t("analyticsEmptyDesc")}
                inPeriod={hasAnyData}
                t={t}
              />
            ) : (
              <AnalyticsChart>
                <BarChart
                  data={waterGrouped}
                  margin={{ ...CHART_MARGIN, bottom: waterGrouped.length > 6 ? 8 : 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="label" {...chartXAxisProps(waterGrouped.length)} />
                  <YAxis
                    tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
                    width={44}
                    tickMargin={4}
                  />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} cursor={TOOLTIP_CURSOR} />
                  <Bar
                    dataKey="consumed"
                    name={t("analyticsWaterLegend")}
                    fill="var(--color-primary)"
                    maxBarSize={32}
                  />
                </BarChart>
              </AnalyticsChart>
            )}
          </section>

          {stoolGrouped.length > 0 && (
            <section className="card analytics-chart-card">
              <h2 className="analytics-chart-title">{t("analyticsStoolChartTitle")}</h2>
              <AnalyticsChart>
                <BarChart
                  data={stoolGrouped}
                  margin={{ ...CHART_MARGIN, bottom: stoolGrouped.length > 6 ? 8 : 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="label" {...chartXAxisProps(stoolGrouped.length)} />
                  <YAxis
                    domain={[1, 7]}
                    tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
                    width={28}
                    tickMargin={4}
                  />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} cursor={TOOLTIP_CURSOR} />
                  <Bar
                    dataKey="avg"
                    name={t("analyticsStoolLegend")}
                    fill="var(--chart-secondary)"
                    maxBarSize={32}
                  />
                </BarChart>
              </AnalyticsChart>
            </section>
          )}

          {!hasAnyData && (
            <p className="meta" style={{ marginTop: 16, textAlign: "center" }}>
              <Link href="/q">{t("quickRecordTitle")}</Link>
              {" · "}
              {t("analyticsEmptyDesc")}
            </p>
          )}
        </>
      )}
    </main>
  );
}
