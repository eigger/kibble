const CACHE_NAME = "kibble-shell-v9";
importScripts("sw-background-fetch.js");

// public/ 파일은 빌드 시 basePath가 붙지 않는다. 대신 서비스워커는 자기 스코프를 알고 있으므로
// 거기서 배포 프리픽스를 그대로 얻는다 — 루트 배포면 "", /kibble 아래면 "/kibble".
const BASE_PATH = new URL(self.registration.scope).pathname.replace(/\/+$/, "");
const url = (path) => (path.startsWith("/") ? `${BASE_PATH}${path}` : path);

/** 프리픽스를 뗀, 앱 기준 경로. lib/base-path.ts `stripBasePath`와 같은 규칙. */
function appPath(requestUrl) {
  const { pathname } = new URL(requestUrl);
  if (!BASE_PATH) return pathname;
  if (pathname === BASE_PATH) return "/";
  if (pathname.startsWith(`${BASE_PATH}/`)) return pathname.slice(BASE_PATH.length) || "/";
  return pathname;
}

/** 앱 경로에 프리픽스와 trailing slash를 붙인다. 절대 URL은 그대로 둔다. */
function pageUrl(path) {
  const raw = path || "/";
  if (!raw.startsWith("/")) return raw;
  const q = raw.indexOf("?");
  const pathname = q === -1 ? raw : raw.slice(0, q);
  const search = q === -1 ? "" : raw.slice(q);
  const slashed = pathname.endsWith("/") ? pathname : `${pathname}/`;
  return url(`${slashed}${search}`);
}

// 주의: 뒤 슬래시가 있어야 한다. trailingSlash 때문에 슬래시 없는 주소는 308이 되고,
// cache.addAll은 리다이렉트된 응답을 저장하지 못해 목록 전체가 통째로 실패한다.
const SHELL_ASSETS = [
  "/",
  "/login/",
  "/onboarding/",
  "/q/",
  "/settings/",
  "/backup/",
  "/users/",
  "/offline/",
  "/icons/icon.svg",
  "/icons/badge-96.png",
  "/icons/badge.svg",
].map(url);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  const keep = new Set([CACHE_NAME, BF_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => kickIfIdle()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (appPath(request.url).startsWith("/api/")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => {
          if (cached) return cached;
          if (request.mode === "navigate") return caches.match(url("/offline/"));
          return Response.error();
        }),
      ),
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "Kibble", body: "", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    /* malformed payload */
  }

  const iconUrl = new URL(url("/icons/icon-192.png"), self.location.origin).href;
  const badgeUrl = new URL(url("/icons/badge-96.png"), self.location.origin).href;
  const targetUrl = new URL(pageUrl(data.url || "/"), self.location.origin).href;

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: iconUrl,
      badge: badgeUrl,
      // API가 주는 경로는 앱 기준(루트 상대)이라, 서브패스 배포에서는 프리픽스를 붙여야
      // 알림을 눌렀을 때 앱 밖으로 나가지 않는다. trailingSlash 때문에 슬래시 없는
      // 주소는 308이 되므로 페이지 경로는 슬래시를 붙여 연다.
      data: { url: targetUrl },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "cancel") {
    const jobId = event.notification.data?.jobId;
    const eventId = event.notification.data?.eventId;
    event.waitUntil(
      (async () => {
        if (jobId) {
          await abortJob(jobId);
        } else {
          await abortAllBf();
        }
        await notifyClients({ action: "cancel", jobId, eventId });
        await notifyClients({ action: "idle" });
      })(),
    );
    return;
  }

  const rawTarget = event.notification.data?.url || pageUrl("/");
  const targetPath = pageUrl(rawTarget);
  const fullUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const visibleClient = clients.find((c) => c.visibilityState === "visible");
      if (visibleClient && "focus" in visibleClient) {
        try {
          if ("navigate" in visibleClient && visibleClient.url !== fullUrl) {
            await visibleClient.navigate(fullUrl);
          }
          await visibleClient.focus();
          return;
        } catch {}
      }
      if (self.clients.openWindow) {
        try {
          const win = await self.clients.openWindow(fullUrl);
          if (win) return;
        } catch {}
      }
      for (const client of clients) {
        if ("focus" in client) {
          try {
            if ("navigate" in client && client.url !== fullUrl) {
              await client.navigate(fullUrl);
            }
            await client.focus();
            return;
          } catch (err) {
            console.warn("[sw] focus/navigate failed", err);
          }
        }
      }
    })(),
  );
});

self.addEventListener("sync", (event) => {
  if (event.tag === "kibble-upload-sync") {
    event.waitUntil(
      (async () => {
        try {
          const jobs = await getAllJobs();
          let revived = false;
          for (const job of jobs) {
            if (job.status === "failed") {
              job.status = "pending";
              job.retries = 0;
              await putJob(job);
              revived = true;
            }
          }
          if (revived) {
            await kickIfIdle();
          }
        } catch (err) {
          console.warn("[kibble] sync event handler failed", err);
        }
      })(),
    );
  }
});
