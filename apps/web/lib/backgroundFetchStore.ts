import {
  BF_CACHE,
  BF_DB_NAME,
  BF_DB_VERSION,
  BF_STORE,
  fileCacheUrl,
  type BfJob,
} from "./backgroundFetchJob";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("INDEXEDDB_UNAVAILABLE"));
      return;
    }
    const request = indexedDB.open(BF_DB_NAME, BF_DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("IDB_OPEN_FAILED"));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BF_STORE)) {
        db.createObjectStore(BF_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(BF_STORE, mode);
        const store = tx.objectStore(BF_STORE);
        const request = fn(store);
        let value: T | undefined;
        request.onsuccess = () => {
          value = request.result;
        };
        tx.oncomplete = () => {
          db.close();
          resolve(value as T);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error("IDB_TX_FAILED"));
        };
      }),
  );
}

export function putBfJob(job: BfJob): Promise<void> {
  return runTransaction("readwrite", (store) => store.put(job)).then(() => undefined);
}

export function getBfJob(id: string): Promise<BfJob | undefined> {
  return runTransaction("readonly", (store) => store.get(id));
}

export function getAllBfJobs(): Promise<BfJob[]> {
  return runTransaction("readonly", (store) => store.getAll()).then((rows) => rows ?? []);
}

export function deleteBfJob(id: string): Promise<void> {
  return runTransaction("readwrite", (store) => store.delete(id)).then(() => undefined);
}

export async function persistBfBlobs(jobId: string, files: File[]): Promise<void> {
  const cache = await caches.open(BF_CACHE);
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const headers = new Headers();
    if (file.type) headers.set("Content-Type", file.type);
    headers.set("Content-Length", String(file.size));
    await cache.put(fileCacheUrl(jobId, i), new Response(file, { headers }));
  }
}

export async function deleteBfBlobs(jobId: string, fileCount: number): Promise<void> {
  const cache = await caches.open(BF_CACHE);
  await Promise.all(
    Array.from({ length: fileCount }, (_, i) => cache.delete(fileCacheUrl(jobId, i))),
  );
}

export async function deleteBfJobAndBlobs(job: Pick<BfJob, "id" | "files">): Promise<void> {
  await deleteBfBlobs(job.id, job.files.length);
  await deleteBfJob(job.id);
}
