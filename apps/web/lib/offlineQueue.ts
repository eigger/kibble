import type { CreateEventInput } from "@kibble/shared";

const DB_NAME = "kibble-offline";
const DB_VERSION = 1;
const STORE = "events";

export interface QueuedAttachment {
  id: string;
  name: string;
  type: string;
  blob: Blob;
}

export interface QueuedEvent {
  id: string;
  queuedAt: number;
  /** i18n 키 — 토스트용 */
  labelKey: string;
  body: CreateEventInput;
  /** 이벤트 POST 성공 후 첨부만 남은 경우 */
  eventId?: string;
  attachments: QueuedAttachment[];
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** 큐 적재 시각을 occurredAt으로 고정 — flush 시각이 아닌 탭 시각이 서버에 간다 */
export function withQueuedOccurredAt(body: CreateEventInput): CreateEventInput {
  return body.occurredAt ? body : { ...body, occurredAt: new Date().toISOString() };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("INDEXEDDB_UNAVAILABLE"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("IDB_OPEN_FAILED"));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        const result = fn(store);
        const onDone = (value: T) => {
          tx.oncomplete = () => {
            db.close();
            resolve(value);
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error ?? new Error("IDB_TX_FAILED"));
          };
        };
        if (result instanceof Promise) {
          void result.then(onDone).catch(reject);
        } else {
          result.onsuccess = () => onDone(result.result as T);
          result.onerror = () => {
            db.close();
            reject(result.error ?? new Error("IDB_REQUEST_FAILED"));
          };
        }
      }),
  );
}

function filesToAttachments(files: File[]): QueuedAttachment[] {
  return files.map((file) => ({
    id: newId(),
    name: file.name,
    type: file.type || "application/octet-stream",
    blob: file,
  }));
}

export async function enqueueOfflineEvent(input: {
  labelKey: string;
  body: CreateEventInput;
  attachments?: File[];
}): Promise<string> {
  const entry: QueuedEvent = {
    id: newId(),
    queuedAt: Date.now(),
    labelKey: input.labelKey,
    body: withQueuedOccurredAt(input.body),
    attachments: filesToAttachments(input.attachments ?? []),
  };
  await runTransaction("readwrite", (store) => store.put(entry));
  return entry.id;
}

export async function updateOfflineEvent(entry: QueuedEvent): Promise<void> {
  await runTransaction("readwrite", (store) => store.put(entry));
}

export async function listOfflineEvents(): Promise<QueuedEvent[]> {
  return runTransaction("readonly", (store) => {
    const request = store.getAll();
    return new Promise<QueuedEvent[]>((resolve, reject) => {
      request.onsuccess = () => {
        const rows = (request.result as QueuedEvent[]).slice();
        rows.sort((a, b) => a.queuedAt - b.queuedAt);
        resolve(rows);
      };
      request.onerror = () => reject(request.error ?? new Error("IDB_GETALL_FAILED"));
    });
  });
}

export async function getOfflineQueueCount(): Promise<number> {
  const rows = await listOfflineEvents();
  return rows.length;
}

/** 고유 id로만 제거 — timestamp 기반 제거는 형제 항목 유실 위험 */
export async function removeOfflineEvent(id: string): Promise<void> {
  await runTransaction("readwrite", (store) => store.delete(id));
}

export function attachmentsToFiles(attachments: QueuedAttachment[]): File[] {
  return attachments.map(
    (att) => new File([att.blob], att.name, { type: att.type, lastModified: Date.now() }),
  );
}
