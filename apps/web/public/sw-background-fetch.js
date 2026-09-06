/**
 * Background Fetch 업로드. sw.js에서 importScripts 한다.
 *
 * 상태기(nextBfWork / applyBfSuccess)는 apps/web/lib/backgroundFetchJob.ts와 맞춰 둔다.
 * 청크 크기는 잡 레코드 job.chunkSize만 쓴다 — 여기에 8MB를 적지 않는다.
 * 영상 청크는 서버가 순서를 강제하므로(409) 한 번에 요청 하나, 성공 이벤트에서 다음을 잇는다.
 */
const BF_DB_NAME = "kibble-bf";
// lib/backgroundFetchJob.ts BF_DB_VERSION와 같아야 한다. v1 잡에는 chunkSize가 없다.
const BF_DB_VERSION = 2;
const BF_STORE = "jobs";
const BF_CACHE = "kibble-bf-v1";
const BF_FETCH_PREFIX = "kbf:";
const BF_MESSAGE_TYPE = "kibble-bf";
const BF_SW_KICK = "kibble-bf-kick";
const BF_SW_CANCEL = "kibble-bf-cancel";
const BF_SW_ABORT_JOB = "kibble-bf-abort-job";
const BF_MAX_RETRIES = 5;
const BF_MAX_BACKOFF_MS = 5000;

function fileCacheUrl(jobId, index) {
  return `https://kibble.invalid/bf/${jobId}/${index}`;
}

function jobChunkSize(job) {
  if (typeof job.chunkSize === "number" && job.chunkSize > 0) return job.chunkSize;
  throw new Error("BF_CHUNK_SIZE_MISSING");
}

function chunkCount(size, chunkSize) {
  if (size <= 0) return 1;
  return Math.ceil(size / chunkSize);
}

function backoffMs(attempt) {
  return Math.min(500 * 2 ** (attempt - 1), BF_MAX_BACKOFF_MS);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function currentFileIndex(job) {
  const uploaded = new Set(job.uploadedIndex || []);
  for (let i = job.fileIndex; i < job.files.length; i++) {
    if (!uploaded.has(i)) return i;
  }
  return job.files.length;
}

function nextBfWork(job) {
  const fileIndex = currentFileIndex(job);
  if (fileIndex >= job.files.length) return { kind: "done" };
  const file = job.files[fileIndex];
  const chunkSize = jobChunkSize(job);
  if (!file.chunked) return { kind: "multipart", fileIndex };
  if (!job.uploadId) return { kind: "init", fileIndex };
  if (job.chunkIndex >= chunkCount(file.size, chunkSize)) return { kind: "complete", fileIndex, uploadId: job.uploadId };
  return {
    kind: "chunk",
    fileIndex,
    chunkIndex: job.chunkIndex,
    uploadId: job.uploadId,
  };
}

function applyBfSuccess(job, work, result) {
  result = result || {};
  if (work.kind === "multipart") {
    const file = job.files[work.fileIndex];
    return Object.assign({}, job, {
      fileIndex: work.fileIndex + 1,
      uploaded: result.attachment ? job.uploaded.concat([result.attachment]) : job.uploaded,
      uploadedIndex: (job.uploadedIndex || []).concat([work.fileIndex]),
      bytesDone: job.bytesDone + file.size,
      retries: 0,
    });
  }
  if (work.kind === "init") {
    return Object.assign({}, job, {
      uploadId: result.uploadId || job.uploadId,
      chunkIndex: 0,
      retries: 0,
    });
  }
  if (work.kind === "chunk") {
    const file = job.files[work.fileIndex];
    const chunkSize = jobChunkSize(job);
    const start = work.chunkIndex * chunkSize;
    const size = Math.min(chunkSize, Math.max(0, file.size - start));
    return Object.assign({}, job, {
      chunkIndex: job.chunkIndex + 1,
      bytesDone: job.bytesDone + size,
      retries: 0,
    });
  }
  if (work.kind === "complete") {
    return Object.assign({}, job, {
      fileIndex: work.fileIndex + 1,
      chunkIndex: 0,
      uploadId: null,
      uploaded: result.attachment ? job.uploaded.concat([result.attachment]) : job.uploaded,
      uploadedIndex: (job.uploadedIndex || []).concat([work.fileIndex]),
      retries: 0,
    });
  }
  return job;
}

function uploadedBytes(job) {
  const uploaded = new Set(job.uploadedIndex || []);
  return job.files.reduce((n, file, i) => (uploaded.has(i) ? n + file.size : n), 0);
}

function applyChunkDesync(job, receivedBytes, nextChunkIndex) {
  return Object.assign({}, job, {
    chunkIndex: nextChunkIndex,
    bytesDone: uploadedBytes(job) + receivedBytes,
  });
}

function skipCurrentFile(job) {
  const index = currentFileIndex(job);
  return Object.assign({}, job, {
    skipped: (job.skipped || []).concat([index]),
    fileIndex: index + 1,
    chunkIndex: 0,
    uploadId: null,
    fetchId: null,
    retries: 0,
  });
}

function remainingFileCount(job) {
  const uploaded = new Set(job.uploadedIndex || []);
  let n = 0;
  for (let i = 0; i < job.files.length; i++) {
    if (!uploaded.has(i)) n += 1;
  }
  return n;
}

function parseBfFetchId(id) {
  if (!id || id.indexOf(BF_FETCH_PREFIX) !== 0) return null;
  const rest = id.slice(BF_FETCH_PREFIX.length);
  const last = rest.lastIndexOf(":");
  if (last <= 0) return null;
  const jobId = rest.slice(0, last);
  const seq = Number(rest.slice(last + 1));
  if (!jobId || !Number.isInteger(seq)) return null;
  return { jobId, seq };
}

function isPermanentBfStatus(status, workKind) {
  if (status === 400 || status === 404 || status === 413 || status === 415 || status === 422) {
    return true;
  }
  return status === 409 && workKind !== "chunk";
}

function openBfDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(BF_DB_NAME, BF_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (db.objectStoreNames.contains(BF_STORE)) db.deleteObjectStore(BF_STORE);
      db.createObjectStore(BF_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IDB_OPEN_FAILED"));
  });
}

function bfTx(mode, fn) {
  return openBfDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(BF_STORE, mode);
        const store = tx.objectStore(BF_STORE);
        const request = fn(store);
        let value;
        request.onsuccess = () => {
          value = request.result;
        };
        tx.oncomplete = () => {
          db.close();
          resolve(value);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error || new Error("IDB_TX_FAILED"));
        };
      }),
  );
}

function putJob(job) {
  return bfTx("readwrite", (store) => store.put(job)).then(() => undefined);
}

function getJob(id) {
  return bfTx("readonly", (store) => store.get(id));
}

function getAllJobs() {
  return bfTx("readonly", (store) => store.getAll()).then((rows) => rows || []);
}

function deleteJob(id) {
  return bfTx("readwrite", (store) => store.delete(id)).then(() => undefined);
}

async function deleteJobBlobs(job) {
  const cache = await caches.open(BF_CACHE);
  await Promise.all(job.files.map((_, i) => cache.delete(fileCacheUrl(job.id, i))));
}

async function deleteJobAndBlobs(job) {
  await deleteJobBlobs(job);
  await deleteJob(job.id);
}

async function getFileBlob(job, fileIndex) {
  const cache = await caches.open(BF_CACHE);
  const res = await cache.match(fileCacheUrl(job.id, fileIndex));
  if (!res) throw new Error("BF_BLOB_MISSING");
  return res.blob();
}

function jobHeaders(job, extra) {
  const headers = new Headers(extra || undefined);
  if (job.token) headers.set("Authorization", `Bearer ${job.token}`);
  if (job.locale) headers.set("X-Locale", job.locale);
  return headers;
}

function notifyClients(payload) {
  const message = Object.assign({ type: BF_MESSAGE_TYPE }, payload);
  return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    for (const client of clients) client.postMessage(message);
  });
}

function progressFields(job) {
  const bytesTotal = job.files.reduce((n, file) => n + file.size, 0);
  return {
    jobId: job.id,
    eventId: job.eventId,
    fileIndex: job.fileIndex,
    fileCount: job.files.length,
    bytesDone: job.bytesDone,
    bytesTotal: Math.max(bytesTotal, 1),
  };
}

function headerSafe(value) {
  return String(value).replace(/[\r\n"]/g, "_");
}

function multipartRequest(url, blob, fileName, mime, headers) {
  if (typeof FormData !== "undefined") {
    const formData = new FormData();
    formData.append("file", blob, fileName);
    const reqHeaders = new Headers(headers);
    reqHeaders.delete("Content-Type");
    return new Request(url, {
      method: "POST",
      headers: reqHeaders,
      body: formData,
      credentials: "same-origin",
    });
  }
  const boundary = `----kibble${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
  const safe = headerSafe(fileName);
  const encoded = encodeURIComponent(fileName);
  const safeMime = headerSafe(mime || "application/octet-stream");
  const head =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${safe}"; filename*=UTF-8''${encoded}\r\n` +
    `Content-Type: ${safeMime}\r\n\r\n`;
  const tail = `\r\n--${boundary}--\r\n`;
  headers.set("Content-Type", `multipart/form-data; boundary=${boundary}`);
  return new Request(url, {
    method: "POST",
    headers,
    body: new Blob([head, blob, tail]),
    credentials: "same-origin",
  });
}

async function jsonFetch(job, path, init) {
  const headers = jobHeaders(job, init.headers);
  if (init.body && typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${job.apiBase}${path}`, {
    method: init.method,
    headers,
    body: init.body,
    credentials: "same-origin",
    cache: "no-store",
  });
}

let cancelling = false;
let kickQueue = Promise.resolve();

function kickIfIdle() {
  const run = () => runKick().catch((err) => console.warn("[kibble] bf kick", err));
  kickQueue = kickQueue.then(run, run);
  return kickQueue;
}

const SW_NOTIFICATION_TAG = "kibble-upload";

function jobBadgeUrl(job) {
  if (job && job.badgeUrl) return job.badgeUrl;
  if (job && job.iconUrl && job.iconUrl.indexOf("/icons/icon-192.png") !== -1) {
    return job.iconUrl.replace(/\/icons\/icon-192\.png$/, "/icons/badge-96.png");
  }
  return toAssetUrl("/icons/badge-96.png");
}

function jobIconUrl(job) {
  if (job && job.iconUrl) return job.iconUrl;
  return toAssetUrl("/icons/icon-192.png");
}

function toAssetUrl(path) {
  if (!path) return path;
  if (typeof url === "function") return url(path);
  return path;
}

function toPageUrl(path) {
  if (!path) return path;
  if (typeof pageUrl === "function") return pageUrl(path);
  return path;
}

function toAppUrl(path) {
  return toPageUrl(path);
}

async function registerSyncIfSupported() {
  if (self.registration && "sync" in self.registration) {
    try {
      await self.registration.sync.register("kibble-upload-sync");
    } catch (err) {
      console.warn("[kibble] bg sync register failed", err);
    }
  }
}

const SW_DICT = {
  uploadingSingle: {
    ko: "사진 올리는 중...{percent}",
    en: "Uploading...{percent}",
  },
  uploadingMultiple: {
    ko: "사진 {current}/{total}장 올리는 중...{percent}",
    en: "Uploading {current}/{total}...{percent}",
  },
  completeSingle: {
    ko: "사진 업로드 완료",
    en: "Photo uploaded",
  },
  completeMultiple: {
    ko: "사진 {count}장 업로드 완료",
    en: "{count} photos uploaded",
  },
  failed: {
    ko: "사진 {count}장 업로드 실패. 다시 시도해 주세요.",
    en: "Upload failed ({count} files). Please try again.",
  },
  cancel: {
    ko: "취소",
    en: "Cancel",
  },
};

function swTranslate(locale, key, params) {
  const loc = locale === "en" ? "en" : "ko";
  const entry = SW_DICT[key];
  if (!entry) return key;
  let text = entry[loc] || entry.ko;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, k) => (k in params ? String(params[k]) : match));
}

async function showSwProgressNotification(job) {
  if (!self.registration || !self.registration.showNotification) return;
  const currentNum = Math.min((job.fileIndex || 0) + 1, job.files.length);
  const total = job.files.length;
  const locale = job.locale === "en" ? "en" : "ko";

  let percentText = "";
  const bytesTotal = (job.files || []).reduce((n, f) => n + (f.size || 0), 0);
  if (bytesTotal > 0 && typeof job.bytesDone === "number") {
    const pct = Math.min(100, Math.max(0, Math.round((job.bytesDone / bytesTotal) * 100)));
    percentText = ` (${pct}%)`;
  }

  const body = total > 1
    ? swTranslate(locale, "uploadingMultiple", {
        current: currentNum,
        total,
        percent: percentText,
      })
    : swTranslate(locale, "uploadingSingle", {
        percent: percentText,
      });
  const icon = new URL(toAssetUrl(jobIconUrl(job)), self.location.origin).href;
  const badge = new URL(toAssetUrl(jobBadgeUrl(job)), self.location.origin).href;
  const targetUrl = new URL(
    toPageUrl(job.eventId ? `/history/?highlight=${encodeURIComponent(job.eventId)}` : "/history/"),
    self.location.origin,
  ).href;

  try {
    await self.registration.showNotification("Kibble", {
      tag: SW_NOTIFICATION_TAG,
      body,
      icon,
      badge,
      silent: true,
      data: { url: targetUrl, jobId: job.id, eventId: job.eventId },
      actions: [{ action: "cancel", title: swTranslate(locale, "cancel") }],
    });
  } catch {}
}

async function showSwCompleteNotification(job) {
  if (!self.registration || !self.registration.showNotification) return;
  const total = (job.uploaded || []).length || job.files.length;
  const locale = job.locale === "en" ? "en" : "ko";
  const body = total > 1
    ? swTranslate(locale, "completeMultiple", { count: total })
    : swTranslate(locale, "completeSingle");
  const icon = new URL(toAssetUrl(jobIconUrl(job)), self.location.origin).href;
  const badge = new URL(toAssetUrl(jobBadgeUrl(job)), self.location.origin).href;
  const targetUrl = new URL(
    toPageUrl(job.eventId ? `/history/?highlight=${encodeURIComponent(job.eventId)}` : "/history/"),
    self.location.origin,
  ).href;
  try {
    await self.registration.showNotification("Kibble", {
      tag: SW_NOTIFICATION_TAG,
      body,
      icon,
      badge,
      silent: true,
      data: { url: targetUrl, eventId: job.eventId },
    });
    setTimeout(async () => {
      try {
        const notifications = await self.registration.getNotifications({ tag: SW_NOTIFICATION_TAG });
        for (const n of notifications) n.close();
      } catch {}
    }, 3500);
  } catch {}
}

async function showSwFailedNotification(job, leftover) {
  if (!self.registration || !self.registration.showNotification) return;
  const locale = job.locale === "en" ? "en" : "ko";
  const body = swTranslate(locale, "failed", { count: leftover });
  const icon = new URL(toAssetUrl(jobIconUrl(job)), self.location.origin).href;
  const badge = new URL(toAssetUrl(jobBadgeUrl(job)), self.location.origin).href;
  const targetUrl = new URL(
    toPageUrl(job.eventId ? `/history/?highlight=${encodeURIComponent(job.eventId)}` : "/history/"),
    self.location.origin,
  ).href;
  try {
    await self.registration.showNotification("Kibble", {
      tag: SW_NOTIFICATION_TAG,
      body,
      icon,
      badge,
      silent: false,
      data: { url: targetUrl, eventId: job.eventId },
    });
  } catch {}
}

async function dismissSwNotification() {
  if (!self.registration || !self.registration.getNotifications) return;
  try {
    const notifications = await self.registration.getNotifications({ tag: SW_NOTIFICATION_TAG });
    for (const n of notifications) n.close();
  } catch {}
}

async function abortAllBf() {
  if (self.registration.backgroundFetch) {
    try {
      const ids = await self.registration.backgroundFetch.getIds();
      await Promise.all(
        ids
          .filter((id) => id.indexOf(BF_FETCH_PREFIX) === 0)
          .map(async (id) => {
            const active = await self.registration.backgroundFetch.get(id);
            if (active) await active.abort();
          }),
      );
    } catch {}
  }
  await dismissSwNotification();
}

async function startBgFetch(job, request) {
  if (!self.registration.backgroundFetch) throw new Error("NO_BACKGROUND_FETCH");
  job.seq = (job.seq || 0) + 1;
  const id = `${BF_FETCH_PREFIX}${job.id}:${job.seq}`;
  job.fetchId = id;
  await putJob(job);
  const icons = job.iconUrl ? [{ src: job.iconUrl, sizes: "192x192", type: "image/png" }] : [];
  const options = {
    title: (job.ui && job.ui.uploading) || "Kibble",
    icons,
    // Blink WebIDL은 downloadTotal 기본값이 0이다. 서버의 201 Created JSON 응답 등
    // 응답 바이트가 0을 초과하면 Blink가 'download-total-exceeded'로 즉시 페치 실패 처리한다.
    // JSON 응답을 넉넉히 수용할 수 있도록 10MB 상한을 지정한다.
    downloadTotal: 10 * 1024 * 1024,
  };
  await self.registration.backgroundFetch.fetch(id, [request], options);
}

async function retryOrFail(job) {
  job.fetchId = null;
  job.retries = (job.retries || 0) + 1;
  if (job.retries < BF_MAX_RETRIES) {
    await putJob(job);
    await sleep(backoffMs(job.retries));
    await performWork(job);
    return false;
  }
  // 모바일에서 오프라인 상태일 때는 즉시 실패로 영구 종결하지 않고,
  // sync나 온라인 복귀 시 재시도할 수 있도록 pending 상태를 유지한다.
  if (typeof self.navigator !== "undefined" && "onLine" in self.navigator && !self.navigator.onLine) {
    job.status = "pending";
    await putJob(job);
    await registerSyncIfSupported();
    await notifyClients(
      Object.assign({ action: "fail", remainingCount: remainingFileCount(job) }, progressFields(job)),
    );
    return false;
  }
  job.status = "failed";
  await putJob(job);
  await registerSyncIfSupported();
  await notifyClients(
    Object.assign({ action: "fail", remainingCount: remainingFileCount(job) }, progressFields(job)),
  );
  await runKick();
  return false;
}

async function handleHttpError(job, work, res) {
  if (isPermanentBfStatus(res.status, work.kind)) {
    Object.assign(job, skipCurrentFile(job));
    await putJob(job);
    await notifyClients(Object.assign({ action: "progress" }, progressFields(job)));
    await performWork(job);
    return false;
  }
  if (res.status === 401 || res.status === 403) {
    job.status = "failed";
    job.fetchId = null;
    await putJob(job);
    await notifyClients(
      Object.assign({ action: "fail", remainingCount: remainingFileCount(job) }, progressFields(job)),
    );
    await runKick();
    return false;
  }
  return retryOrFail(job);
}

async function fetchProgress(job, uploadId) {
  const res = await jsonFetch(job, `/api/attachments/uploads/${uploadId}`, { method: "GET" });
  if (!res.ok) return null;
  const body = await res.json();
  if (typeof body.receivedBytes !== "number" || typeof body.nextChunkIndex !== "number") return null;
  return { receivedBytes: body.receivedBytes, nextChunkIndex: body.nextChunkIndex };
}

async function doInit(job, work) {
  const file = job.files[work.fileIndex];
  try {
    const res = await jsonFetch(job, "/api/attachments/uploads", {
      method: "POST",
      body: JSON.stringify({
        eventId: job.eventId,
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        totalSize: file.size,
      }),
    });
    if (!res.ok) return handleHttpError(job, work, res);
    const data = await res.json();
    Object.assign(job, applyBfSuccess(job, work, { uploadId: data.uploadId }));
    await putJob(job);
    return true;
  } catch (err) {
    console.warn("[kibble] bf init", err);
    return retryOrFail(job);
  }
}

async function doComplete(job, work) {
  try {
    const res = await jsonFetch(job, `/api/attachments/uploads/${work.uploadId}/complete`, {
      method: "POST",
    });
    if (!res.ok) return handleHttpError(job, work, res);
    const attachment = await res.json();
    Object.assign(job, applyBfSuccess(job, work, { attachment }));
    await putJob(job);
    await notifyClients(Object.assign({ action: "progress" }, progressFields(job)));
    return true;
  } catch (err) {
    console.warn("[kibble] bf complete", err);
    return retryOrFail(job);
  }
}

async function handleSwFetchSettled(job, work, res) {
  if (cancelling) return;
  const fresh = await getJob(job.id);
  if (!fresh || fresh.status === "cancelled") return;

  if (res && res.ok) {
    const result = {};
    if (work.kind === "multipart") {
      try {
        result.attachment = await res.json();
      } catch {
        await retryOrFail(job);
        return;
      }
    }
    Object.assign(job, applyBfSuccess(job, work, result));
    await putJob(job);
    await notifyClients(Object.assign({ action: "progress" }, progressFields(job)));
    await showSwProgressNotification(job);
    await performWork(job);
    return;
  }

  if (work.kind === "chunk" && res && res.status === 409) {
    const progress = await fetchProgress(job, work.uploadId).catch(() => null);
    if (progress && progress.nextChunkIndex !== job.chunkIndex) {
      Object.assign(job, applyChunkDesync(job, progress.receivedBytes, progress.nextChunkIndex));
      job.retries = 0;
      await putJob(job);
      await performWork(job);
      return;
    }
  }

  if (res) {
    await handleHttpError(job, work, res);
    return;
  }

  await retryOrFail(job);
}

async function doMultipartBf(job, work) {
  const file = job.files[work.fileIndex];
  let blob;
  try {
    blob = await getFileBlob(job, work.fileIndex);
  } catch (err) {
    console.warn("[kibble] sw multipart getFileBlob failed", err);
    Object.assign(job, skipCurrentFile(job));
    await putJob(job);
    await notifyClients(
      Object.assign({ action: "fail", remainingCount: remainingFileCount(job) }, progressFields(job)),
    );
    await performWork(job);
    return;
  }
  const request = multipartRequest(
    `${job.apiBase}/api/attachments?eventId=${encodeURIComponent(job.eventId)}`,
    blob,
    file.name,
    file.type,
    jobHeaders(job),
  );
  const baseBytesDone = job.bytesDone || 0;
  const fileSize = file.size || 0;
  let progressTimer = null;

  try {
    await notifyClients(Object.assign({ action: "started" }, progressFields(job)));
    await showSwProgressNotification(job);

    // Fetch는 브라우저 업로드 스트림 진행률 이벤트를 주지 않으므로
    // 실제 전송 중 실시간 퍼센트를 체감할 수 있도록 가상 틱커를 가동한다.
    let currentPct = 5;
    progressTimer = setInterval(() => {
      if (currentPct < 90) {
        currentPct += Math.max(3, Math.round((90 - currentPct) * 0.25));
        const estBytes = Math.round((currentPct / 100) * fileSize);
        job.bytesDone = baseBytesDone + estBytes;
        void showSwProgressNotification(job);
        void notifyClients(Object.assign({ action: "progress" }, progressFields(job)));
      }
    }, 500);

    const res = await fetch(request);
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
    await handleSwFetchSettled(job, work, res);
  } catch (err) {
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
    job.bytesDone = baseBytesDone;
    console.warn("[kibble] sw multipart", err);
    job.fetchId = null;
    await retryOrFail(job);
  }
}

async function doChunkBf(job, work) {
  const file = job.files[work.fileIndex];
  let blob;
  try {
    blob = await getFileBlob(job, work.fileIndex);
  } catch (err) {
    console.warn("[kibble] sw chunk getFileBlob failed", err);
    Object.assign(job, skipCurrentFile(job));
    await putJob(job);
    await notifyClients(
      Object.assign({ action: "fail", remainingCount: remainingFileCount(job) }, progressFields(job)),
    );
    await performWork(job);
    return;
  }
  const chunkSize = jobChunkSize(job);
  const start = work.chunkIndex * chunkSize;
  const chunk = blob.slice(start, start + chunkSize);
  const headers = jobHeaders(job);
  headers.set("Content-Type", "application/octet-stream");
  const request = new Request(
    `${job.apiBase}/api/attachments/uploads/${work.uploadId}/chunks/${work.chunkIndex}`,
    {
      method: "PUT",
      headers,
      body: chunk,
      credentials: "same-origin",
    },
  );
  try {
    await notifyClients(Object.assign({ action: "started" }, progressFields(job)));
    await showSwProgressNotification(job);
    const res = await fetch(request);
    await handleSwFetchSettled(job, work, res);
  } catch (err) {
    console.warn("[kibble] sw chunk", err);
    job.fetchId = null;
    await retryOrFail(job);
  }
}

async function finishJob(job) {
  const leftover = remainingFileCount(job);
  if ((job.uploaded || []).length > 0) {
    await notifyClients({
      action: "done",
      jobId: job.id,
      eventId: job.eventId,
      uploaded: job.uploaded,
    });
  }
  if (leftover > 0) {
    job.status = "failed";
    job.fetchId = null;
    await putJob(job);
    await registerSyncIfSupported();
    await notifyClients(
      Object.assign({ action: "fail", remainingCount: leftover }, progressFields(job)),
    );
    await showSwFailedNotification(job, leftover);
    return;
  }
  await showSwCompleteNotification(job);
  await deleteJobAndBlobs(job);
}

async function performWork(job) {
  if (cancelling) return;
  const fresh = await getJob(job.id);
  if (!fresh) return;
  Object.assign(job, fresh);
  if (job.status === "cancelled" || job.status === "failed") return;

  const work = nextBfWork(job);
  if (work.kind === "done") {
    await finishJob(job);
    await runKick();
    return;
  }
  if (work.kind === "init") {
    const ok = await doInit(job, work);
    if (ok) await performWork(job);
    return;
  }
  if (work.kind === "complete") {
    const ok = await doComplete(job, work);
    if (ok) await performWork(job);
    return;
  }
  if (work.kind === "multipart") {
    await doMultipartBf(job, work);
    return;
  }
  if (work.kind === "chunk") {
    await doChunkBf(job, work);
  }
}

async function runKick() {
  if (cancelling) return;
  const jobs = await getAllJobs();
  if (jobs.some((job) => job.status === "running" && job.fetchId)) return;
  const job =
    jobs.find((item) => item.status === "running" && !item.fetchId) ||
    jobs.find((item) => item.status === "pending");
  if (!job) {
    await notifyClients({ action: "idle" });
    return;
  }
  job.status = "running";
  job.fetchId = null;
  await putJob(job);
  await performWork(job);
}

async function onBfSettled(registration, kind) {
  const parsed = parseBfFetchId(registration.id);
  if (!parsed) return;
  const job = await getJob(parsed.jobId);
  if (!job) return;
  if (registration.id !== job.fetchId) return;
  job.fetchId = null;
  if (job.status === "cancelled") {
    await deleteJobAndBlobs(job);
    await runKick();
    return;
  }

  let res;
  try {
    const records = await registration.matchAll();
    if (records && records.length > 0 && records[0].responseReady) {
      res = await records[0].responseReady;
    }
  } catch (err) {
    console.warn("[kibble] bf response inspect", err);
  }

  // 브라우저가 fail로 통지했더라도(예: 다운로드 할당량 초과 판정 또는 네트워크 일시 단절)
  // 서버가 이미 2xx(201 Created 등)를 정상 응답했다면 이미 저장된 것이므로 성공으로 처리한다.
  // 이를 통해 재시도에 따른 파일 중복 업로드를 원천 방지한다.
  if (res && res.ok) {
    const work = nextBfWork(job);
    const result = {};
    if (work.kind === "multipart") {
      try {
        result.attachment = await res.json();
      } catch {
        await retryOrFail(job);
        return;
      }
    }
    Object.assign(job, applyBfSuccess(job, work, result));
    await putJob(job);
    await notifyClients(Object.assign({ action: "progress" }, progressFields(job)));
    await performWork(job);
    return;
  }

  if (kind === "fail") {
    console.warn("[kibble] bf failed, reason:", registration.failureReason);
    await retryOrFail(job);
    return;
  }

  if (!res) {
    await retryOrFail(job);
    return;
  }

  const work = nextBfWork(job);
  if (!res.ok) {
    if (res.status === 409 && work.kind === "chunk") {
      const progress = await fetchProgress(job, work.uploadId).catch(() => null);
      if (progress && progress.nextChunkIndex !== job.chunkIndex) {
        Object.assign(job, applyChunkDesync(job, progress.receivedBytes, progress.nextChunkIndex));
        job.retries = 0;
        await putJob(job);
        await performWork(job);
        return;
      }
    }
    await handleHttpError(job, work, res);
    return;
  }

  const result = {};
  if (work.kind === "multipart") {
    try {
      result.attachment = await res.json();
    } catch {
      await retryOrFail(job);
      return;
    }
  }
  Object.assign(job, applyBfSuccess(job, work, result));
  await putJob(job);
  await notifyClients(Object.assign({ action: "progress" }, progressFields(job)));
  await performWork(job);
}

async function onBfAborted(registration) {
  const parsed = parseBfFetchId(registration.id);
  if (!parsed) return;
  const job = await getJob(parsed.jobId);
  if (!job) return;
  if (job.fetchId && registration.id !== job.fetchId) return;
  await deleteJobAndBlobs(job);
  await runKick();
}

async function openApp(targetUrl) {
  const target = targetUrl || toPageUrl("/");
  const fullUrl = new URL(toPageUrl(target), self.location.origin).href;
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
        console.warn("[kibble] sw openApp focus/navigate failed", err);
      }
    }
  }
}

async function abortJob(jobId) {
  if (!jobId) return;
  const job = await getJob(jobId);
  if (job) {
    job.status = "cancelled";
    await putJob(job);
    if (job.fetchId && self.registration.backgroundFetch) {
      try {
        const active = await self.registration.backgroundFetch.get(job.fetchId);
        if (active) await active.abort();
      } catch {}
    }
    await deleteJobAndBlobs(job);
    await dismissSwNotification();
  }
}

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data.type === BF_SW_KICK) {
    event.waitUntil(kickIfIdle());
  }
  if (data.type === BF_SW_ABORT_JOB && data.jobId) {
    event.waitUntil(abortJob(data.jobId));
  }
  if (data.type === BF_SW_CANCEL) {
    cancelling = true;
    event.waitUntil(
      abortAllBf()
        .catch(() => {})
        .then(() => {
          cancelling = false;
        }),
    );
  }
});

self.addEventListener("online", () => {
  kickIfIdle();
});

self.addEventListener("backgroundfetchsuccess", (event) => {
  event.waitUntil(onBfSettled(event.registration, "success"));
});

self.addEventListener("backgroundfetchfail", (event) => {
  event.waitUntil(onBfSettled(event.registration, "fail"));
});

self.addEventListener("backgroundfetchabort", (event) => {
  event.waitUntil(onBfAborted(event.registration));
});

self.addEventListener("backgroundfetchclick", (event) => {
  const parsed = parseBfFetchId(event.registration && event.registration.id);
  event.waitUntil(
    (async () => {
      let targetUrl = toPageUrl("/");
      if (parsed) {
        const job = await getJob(parsed.jobId);
        if (job && job.eventId) {
          targetUrl = toPageUrl(`/history/?highlight=${encodeURIComponent(job.eventId)}`);
        }
      }
      await openApp(targetUrl);
    })(),
  );
});
