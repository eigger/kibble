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

async function abortAllBf() {
  if (!self.registration.backgroundFetch) return;
  const ids = await self.registration.backgroundFetch.getIds();
  await Promise.all(
    ids
      .filter((id) => id.indexOf(BF_FETCH_PREFIX) === 0)
      .map(async (id) => {
        const active = await self.registration.backgroundFetch.get(id);
        if (active) await active.abort();
      }),
  );
}

async function startBgFetch(job, request) {
  if (!self.registration.backgroundFetch) throw new Error("NO_BACKGROUND_FETCH");
  job.seq = (job.seq || 0) + 1;
  const id = `${BF_FETCH_PREFIX}${job.id}:${job.seq}`;
  job.fetchId = id;
  await putJob(job);
  const icons = job.iconUrl ? [{ src: job.iconUrl, sizes: "192x192", type: "image/png" }] : [];
  await self.registration.backgroundFetch.fetch(id, [request], {
    title: (job.ui && job.ui.uploading) || "Kibble",
    icons,
    downloadTotal: 0,
  });
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
  job.status = "failed";
  await putJob(job);
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

async function doMultipartBf(job, work) {
  const file = job.files[work.fileIndex];
  const blob = await getFileBlob(job, work.fileIndex);
  const request = multipartRequest(
    `${job.apiBase}/api/attachments?eventId=${encodeURIComponent(job.eventId)}`,
    blob,
    file.name,
    file.type,
    jobHeaders(job),
  );
  try {
    await startBgFetch(job, request);
    await notifyClients(Object.assign({ action: "started" }, progressFields(job)));
  } catch (err) {
    console.warn("[kibble] bf multipart", err);
    job.fetchId = null;
    await retryOrFail(job);
  }
}

async function doChunkBf(job, work) {
  const file = job.files[work.fileIndex];
  const blob = await getFileBlob(job, work.fileIndex);
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
    await startBgFetch(job, request);
    await notifyClients(Object.assign({ action: "started" }, progressFields(job)));
  } catch (err) {
    console.warn("[kibble] bf chunk", err);
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
    await notifyClients(
      Object.assign({ action: "fail", remainingCount: leftover }, progressFields(job)),
    );
    return;
  }
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
  if (kind === "fail") {
    await retryOrFail(job);
    return;
  }

  let res;
  try {
    const records = await registration.matchAll();
    res = await records[0].responseReady;
  } catch (err) {
    console.warn("[kibble] bf response", err);
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

async function openApp() {
  const target = pageUrl("/");
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) {
    if (client.url.includes(target) && "focus" in client) return client.focus();
  }
  if (self.clients.openWindow) return self.clients.openWindow(target);
}

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data.type === BF_SW_KICK) {
    event.waitUntil(kickIfIdle());
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
  event.waitUntil(openApp());
});
