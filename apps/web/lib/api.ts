import { recordFailedRequest } from "./bugReport";
import { BASE_PATH } from "./base-path";

function resolveApiUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  // 배포(Caddy)에서는 same-origin(/api) 호출이 맞고, 로컬 개발에서는 8080 API를 기본값으로 쓴다.
  // 서브패스 배포에서는 오리진 뒤에 프리픽스까지 붙여야 프록시가 API로 넘겨준다.
  if (typeof window !== "undefined" && window.location?.origin) return `${window.location.origin}${BASE_PATH}`;
  return "http://localhost:8080";
}

export const API_URL = resolveApiUrl();

const TOKEN_KEY = "kibble_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (init.body && !headers.has("Content-Type") && !isFormData) {
    headers.set("Content-Type", "application/json");
  }
  // 서버 에러 메시지도 앱에서 고른 언어(브라우저/OS 설정이 아니라)로 받기 위해 매 요청에 싣는다.
  const locale = typeof window !== "undefined" ? localStorage.getItem("kibble_locale") : null;
  if (locale) headers.set("X-Locale", locale);
  const res = await fetch(`${API_URL}${path}`, { ...init, headers, cache: "no-store" });
  // 버그 제보 시 자동 첨부되는 최근 실패 요청 — 경로/상태코드만, 본문은 담지 않는다.
  if (!res.ok) {
    recordFailedRequest(init.method ?? "GET", path, res.status);
  }
  return res;
}

// apiJson()은 컴포넌트 밖(어떤 페이지에서든 재사용되는 순수 lib 함수)이라 useLocale()의
// t()를 쓸 수 없다 — 그래서 저장된 언어를 localStorage에서 직접 읽어 폴백 메시지만 고른다.
function requestFailedMessage(status: number): string {
  const locale = typeof window !== "undefined" ? localStorage.getItem("kibble_locale") : null;
  return locale === "en" ? `Request failed (${status})` : `요청 실패 (${status})`;
}

// 4xx(요청 자체가 잘못됨)와 5xx/네트워크(일시적 문제)를 호출부에서 구분할 수 있어야
// 하는 경우가 있다(예: 오프라인 스캔 큐 재전송 — 영구히 거부된 요청과 "나중에 다시
// 시도하면 될 수도 있는" 요청을 다르게 처리해야 함) — 그래서 상태 코드를 실어 던진다.
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** instanceof는 번들 중복 시 깨질 수 있어 name·status로도 판별한다. */
export function isApiError(err: unknown): err is ApiError {
  return (
    err instanceof ApiError ||
    (typeof err === "object" &&
      err !== null &&
      (err as ApiError).name === "ApiError" &&
      typeof (err as ApiError).status === "number")
  );
}

/**
 * multipart POST with byte-level upload progress. `fetch` does not expose
 * `xhr.upload.onprogress`, so a 2.5MB photo sat at 0% until the server
 * replied and then jumped to the checkmark.
 */
export function apiFormUpload<T>(
  path: string,
  formData: FormData,
  onUploadProgress?: (loaded: number, total: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}${path}`);
    xhr.withCredentials = true;
    const token = getToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    const locale = typeof window !== "undefined" ? localStorage.getItem("kibble_locale") : null;
    if (locale) xhr.setRequestHeader("X-Locale", locale);

    xhr.upload.onprogress = (event) => {
      const total = event.lengthComputable && event.total > 0 ? event.total : 0;
      onUploadProgress?.(event.loaded, total);
    };
    xhr.upload.onload = () => {
      // Bytes have left the device. Fetch-based uploads never fired this, so the
      // overlay sat at 0% until the JSON reply and then jumped to the checkmark.
      onUploadProgress?.(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    };

    xhr.onload = () => {
      let body: { error?: unknown } | null = null;
      try {
        body = xhr.responseText ? (JSON.parse(xhr.responseText) as { error?: unknown }) : null;
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        if (xhr.status === 204) {
          resolve(undefined as T);
          return;
        }
        resolve(body as T);
        return;
      }
      recordFailedRequest("POST", path, xhr.status);
      const message =
        typeof body?.error === "string" ? body.error : requestFailedMessage(xhr.status);
      reject(new ApiError(message, xhr.status));
    };
    xhr.onerror = () => {
      reject(new TypeError("Failed to fetch"));
    };
    xhr.onabort = () => {
      reject(new ApiError("", 0));
    };
    xhr.send(formData);
  });
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    // body.error는 보통 사람이 읽을 문자열이지만(예: "이미 다른 아이템에 등록된 바코드 값입니다"),
    // Zod 검증 실패 시에는 객체(flatten() 결과)로 온다 — 문자열은 그대로, 객체만 JSON.stringify.
    const message =
      typeof body?.error === "string" ? body.error : body?.error ? JSON.stringify(body.error) : requestFailedMessage(res.status);
    throw new ApiError(message, res.status);
  }
  if (res.status === 204) return undefined as T;
  try {
    return await res.json();
  } catch {
    throw new ApiError(requestFailedMessage(res.status), res.status);
  }
}

/**
 * 이 요청은 다시 보내도 같은 결과인가. 검증 실패·대상 없음·형식/용량 거부만 영구
 * 거부로 보고, 인증·권한·레이트리밋·5xx·네트워크는 "나중에 되면 될 수도 있는"
 * 실패로 남긴다. (오프라인 큐 재전송, 첨부 일괄 업로드가 같은 기준을 써야 해서 여기에 둔다)
 *
 * 413·415는 파일 하나의 문제이지 서버·회선의 문제가 아니다 — 일시 실패로 두면
 * 용량 초과 영상 하나가 뒤따르는 사진 전부를 막아버리고(이 PR이 고친 바로 그 버그),
 * 오프라인 큐에서는 영원히 재시도된다.
 */
export function isPermanentApiRejection(err: unknown): boolean {
  if (!isApiError(err)) return false;
  const { status } = err;
  return (
    status === 400 ||
    status === 404 ||
    status === 409 ||
    status === 413 ||
    status === 415 ||
    status === 422
  );
}
