import type { CreateEventInput } from "@kibble/shared";

const DB_NAME = "kibble-offline";
// v2: 큐 항목에 소유자(userId)를 붙였다. 배포된 인스턴스가 없으므로 v1 항목을 이전하지 않고
// 스토어를 새로 만든다 — 소유자를 알 수 없는 항목이 남는 경로 자체를 없앤다.
const DB_VERSION = 2;
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
  /**
   * 큐에 넣은 사용자. 주방 태블릿처럼 기기를 공유하면(§7.12) 로그아웃해도 미전송 기록이
   * IndexedDB에 남는데, 401은 영구 거부가 아니라 큐에 유지되므로 그대로 두면 다음 사용자가
   * 로그인했을 때 **이전 사용자의 기록이 그 사람 가구로 들어간다.** 본인 것만 flush한다.
   */
  userId: string;
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
      // 소유자 없는 v1 항목을 이전할 근거가 없다(누가 넣었는지 알 수 없다). 배포 전이므로
      // 스토어를 새로 만든다 — 실기록이 걸릴 일이 없고, 애매한 항목이 남지도 않는다.
      if (db.objectStoreNames.contains(STORE)) db.deleteObjectStore(STORE);
      db.createObjectStore(STORE, { keyPath: "id" });
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
  userId: string;
  labelKey: string;
  body: CreateEventInput;
  attachments?: File[];
}): Promise<string> {
  const entry: QueuedEvent = {
    id: newId(),
    queuedAt: Date.now(),
    userId: input.userId,
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

export function isOwnedBy(entry: QueuedEvent, userId: string): boolean {
  return entry.userId === userId;
}

/** 본인 큐만 돌려준다 — 다른 사용자의 미전송 기록을 대신 전송하면 안 된다. */
export async function listOfflineEvents(userId: string): Promise<QueuedEvent[]> {
  return runTransaction("readonly", (store) => {
    const request = store.getAll();
    return new Promise<QueuedEvent[]>((resolve, reject) => {
      request.onsuccess = () => {
        const rows = (request.result as QueuedEvent[]).filter((row) => isOwnedBy(row, userId));
        rows.sort((a, b) => a.queuedAt - b.queuedAt);
        resolve(rows);
      };
      request.onerror = () => reject(request.error ?? new Error("IDB_GETALL_FAILED"));
    });
  });
}

export async function getOfflineQueueCount(userId: string): Promise<number> {
  const rows = await listOfflineEvents(userId);
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
