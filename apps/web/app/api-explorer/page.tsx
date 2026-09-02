"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL, apiFetch } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useLocale } from "../../lib/i18n/locale-context";
import type { Pet } from "../../lib/types";

type RunResult = { status: number; ms: number; body: unknown } | { error: string };

type ReadEndpoint = {
  key: string;
  /** petId가 필요한 항목은 반려동물을 고르기 전까지 null */
  path: string | null;
  descKey: string;
};

type WriteEndpoint = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  descKey: string;
  curl: string;
};

const AUTH_HEADER = '-H "Authorization: Bearer $TOKEN"';
const JSON_HEADER = '-H "Content-Type: application/json"';

function writeEndpoints(petId: string): WriteEndpoint[] {
  const pet = petId || "<pet-id>";
  return [
    {
      method: "GET",
      path: "/api/states",
      descKey: "apiExplorerTokenState",
      curl: `curl "${API_URL}/api/states" -H "Authorization: Bearer kbl_..."`,
    },
    {
      method: "POST",
      path: "/api/events",
      descKey: "apiExplorerWriteEventToken",
      curl: `curl -X POST "${API_URL}/api/events" \\
  -H "Authorization: Bearer kbl_..." ${JSON_HEADER} \\
  -d '{"presetId":"<preset-id>"}'`,
    },
    {
      method: "POST",
      path: "/api/events",
      descKey: "apiExplorerWriteEventJwt",
      curl: `curl -X POST "${API_URL}/api/events" \\
  ${AUTH_HEADER} ${JSON_HEADER} \\
  -d '{"petId":"${pet}","eventTypeId":"<event-type-id>","note":"메모"}'`,
    },
    {
      method: "PATCH",
      path: "/api/events/:id",
      descKey: "apiExplorerWriteEventPatch",
      curl: `curl -X PATCH "${API_URL}/api/events/<event-id>" \\
  ${AUTH_HEADER} ${JSON_HEADER} \\
  -d '{"note":"고친 메모"}'`,
    },
    {
      method: "DELETE",
      path: "/api/events/:id",
      descKey: "apiExplorerWriteEventDelete",
      curl: `curl -X DELETE "${API_URL}/api/events/<event-id>" ${AUTH_HEADER}`,
    },
    {
      method: "POST",
      path: "/api/parse/entry",
      descKey: "apiExplorerWriteParse",
      curl: `curl -X POST "${API_URL}/api/parse/entry" \\
  ${AUTH_HEADER} ${JSON_HEADER} \\
  -d '{"petId":"${pet}","text":"아침 사료 30g"}'`,
    },
    {
      method: "POST",
      path: "/api/tokens",
      descKey: "apiExplorerWriteToken",
      curl: `curl -X POST "${API_URL}/api/tokens" \\
  ${AUTH_HEADER} ${JSON_HEADER} \\
  -d '{"name":"홈어시스턴트","scopes":["event:create"],"petId":"${pet}"}'`,
    },
  ];
}

export default function ApiExplorerPage() {
  const router = useRouter();
  const { user, loading: authLoading, isAdmin } = useAuth();
  const { t } = useLocale();

  const [pets, setPets] = useState<Pet[]>([]);
  const [petId, setPetId] = useState("");
  const [results, setResults] = useState<Record<string, RunResult>>({});
  const [runningKey, setRunningKey] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) router.replace("/login");
    else if (!isAdmin) router.replace("/settings");
  }, [authLoading, user, isAdmin, router]);

  useEffect(() => {
    if (!user || !isAdmin) return;
    let cancelled = false;
    void apiFetch("/api/pets")
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: Pet[]) => {
        if (cancelled) return;
        setPets(rows);
        if (rows.length > 0) setPetId(rows[0].id);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, isAdmin]);

  const run = useCallback(async (key: string, path: string) => {
    setRunningKey(key);
    const started = performance.now();
    try {
      const res = await apiFetch(path);
      const body = await res.json().catch(() => null);
      setResults((prev) => ({
        ...prev,
        [key]: { status: res.status, ms: Math.round(performance.now() - started), body },
      }));
    } catch (err) {
      setResults((prev) => ({ ...prev, [key]: { error: String(err) } }));
    } finally {
      setRunningKey(null);
    }
  }, []);

  const readEndpoints: ReadEndpoint[] = useMemo(() => {
    const p = petId ? encodeURIComponent(petId) : null;
    return [
      { key: "me", path: "/api/auth/me", descKey: "apiExplorerReadMe" },
      { key: "household", path: "/api/household/me", descKey: "apiExplorerReadHousehold" },
      { key: "onboarding", path: "/api/onboarding/status", descKey: "apiExplorerReadOnboarding" },
      { key: "pets", path: "/api/pets", descKey: "apiExplorerReadPets" },
      { key: "pet", path: p ? `/api/pets/${p}` : null, descKey: "apiExplorerReadPet" },
      { key: "home", path: p ? `/api/home?petId=${p}` : null, descKey: "apiExplorerReadHome" },
      { key: "presets", path: p ? `/api/presets?petId=${p}` : null, descKey: "apiExplorerReadPresets" },
      { key: "eventTypes", path: "/api/event-types", descKey: "apiExplorerReadEventTypes" },
      { key: "events", path: p ? `/api/events?petId=${p}&limit=5` : null, descKey: "apiExplorerReadEvents" },
      {
        key: "historyPeriods",
        path: p ? `/api/events/history-periods?petId=${p}` : null,
        descKey: "apiExplorerReadHistoryPeriods",
      },
      {
        key: "productSuggestions",
        path: p ? `/api/events/product-suggestions?petId=${p}&eventTypeKey=meal` : null,
        descKey: "apiExplorerReadProductSuggestions",
      },
      {
        key: "clinicSuggestions",
        path: p ? `/api/events/clinic-suggestions?petId=${p}` : null,
        descKey: "apiExplorerReadClinicSuggestions",
      },
      { key: "states", path: p ? `/api/states?petId=${p}` : null, descKey: "apiExplorerReadStates" },
      { key: "care", path: p ? `/api/care?petId=${p}` : null, descKey: "apiExplorerReadCare" },
      {
        key: "courses",
        path: p ? `/api/care/medication-courses?petId=${p}` : null,
        descKey: "apiExplorerReadCourses",
      },
      { key: "tokens", path: "/api/tokens", descKey: "apiExplorerReadTokens" },
      { key: "mapProviders", path: "/api/map/providers", descKey: "apiExplorerReadMapProviders" },
      { key: "pushStatus", path: "/api/push/status", descKey: "apiExplorerReadPushStatus" },
      {
        key: "reminderPrefs",
        path: "/api/push/medication-reminder",
        descKey: "apiExplorerReadReminderPrefs",
      },
      { key: "settings", path: "/api/settings", descKey: "apiExplorerReadSettings" },
      { key: "health", path: "/health", descKey: "apiExplorerReadHealth" },
    ];
  }, [petId]);

  if (authLoading || !user || !isAdmin) return null;

  return (
    <main className="container api-explorer">
      <h1>{t("apiExplorerTitle")}</h1>
      <p className="meta">{t("apiExplorerIntro")}</p>
      <p className="meta">
        {t("apiExplorerBaseUrl")} <code className="api-explorer-inline-code">{API_URL}</code>
      </p>

      <section className="card api-explorer-pet">
        <label className="field-label" htmlFor="api-explorer-pet">
          {t("apiExplorerPetLabel")}
        </label>
        {pets.length > 0 ? (
          <select id="api-explorer-pet" value={petId} onChange={(e) => setPetId(e.target.value)}>
            {pets.map((pet) => (
              <option key={pet.id} value={pet.id}>
                {pet.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="meta">{t("apiExplorerNoPets")}</p>
        )}
      </section>

      <h2 className="api-explorer-section-title">{t("apiExplorerReadHeading")}</h2>
      <p className="meta">{t("apiExplorerReadHint")}</p>
      <div className="api-explorer-list">
        {readEndpoints.map((ep) => (
          <EndpointCard
            key={ep.key}
            method="GET"
            path={ep.path ?? t("apiExplorerNeedsPet")}
            desc={t(ep.descKey)}
            disabled={!ep.path}
            running={runningKey === ep.key}
            result={results[ep.key]}
            onRun={() => ep.path && void run(ep.key, ep.path)}
          />
        ))}
      </div>

      <h2 className="api-explorer-section-title">{t("apiExplorerCurlHeading")}</h2>
      <p className="meta">{t("apiExplorerCurlHint")}</p>
      <div className="api-explorer-list">
        {writeEndpoints(petId).map((ep) => (
          <section key={`${ep.method}:${ep.path}:${ep.descKey}`} className="card api-explorer-card">
            <div className="api-explorer-head">
              <span className={`api-explorer-method ${ep.method === "GET" ? "" : "api-explorer-method-write"}`}>
                {ep.method}
              </span>
              <code className="api-explorer-path">{ep.path}</code>
            </div>
            <p className="meta api-explorer-desc">{t(ep.descKey)}</p>
            <pre className="api-explorer-pre">{ep.curl}</pre>
          </section>
        ))}
      </div>
    </main>
  );
}

function EndpointCard({
  method,
  path,
  desc,
  disabled,
  running,
  result,
  onRun,
}: {
  method: string;
  path: string;
  desc: string;
  disabled?: boolean;
  running: boolean;
  result?: RunResult;
  onRun: () => void;
}) {
  const { t } = useLocale();
  const failed = result != null && ("error" in result || result.status >= 400);

  return (
    <section className="card api-explorer-card">
      <div className="api-explorer-head">
        <span className="api-explorer-method">{method}</span>
        <code className="api-explorer-path">{path}</code>
        <button
          type="button"
          className="secondary api-explorer-run"
          onClick={onRun}
          disabled={disabled || running}
        >
          {running ? t("apiExplorerRunning") : t("apiExplorerRun")}
        </button>
      </div>
      <p className="meta api-explorer-desc">{desc}</p>
      {result && (
        <div className="api-explorer-result">
          {"error" in result ? (
            <p className="error-text api-explorer-status">{result.error}</p>
          ) : (
            <>
              <p className={`api-explorer-status ${failed ? "api-explorer-status-fail" : "api-explorer-status-ok"}`}>
                {result.status} · {result.ms}ms
              </p>
              <pre className="api-explorer-pre api-explorer-body">
                {JSON.stringify(result.body, null, 2)}
              </pre>
            </>
          )}
        </div>
      )}
    </section>
  );
}
