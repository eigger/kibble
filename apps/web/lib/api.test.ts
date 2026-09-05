import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, apiFormUpload, apiJson, ApiError, clearToken, setToken } from "./api";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("apiFetch", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, {})));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("attaches the bearer token when logged in", async () => {
    setToken("test-token");
    await apiFetch("/api/auth/me");
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((init.headers as Headers).get("Authorization")).toBe("Bearer test-token");
  });

  it("omits the Authorization header when logged out", async () => {
    clearToken();
    await apiFetch("/api/auth/me");
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((init.headers as Headers).get("Authorization")).toBeNull();
  });

  it("sends the saved locale as X-Locale", async () => {
    localStorage.setItem("kibble_locale", "en");
    await apiFetch("/api/auth/me");
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((init.headers as Headers).get("X-Locale")).toBe("en");
  });

  it("does not set Content-Type for FormData bodies", async () => {
    const formData = new FormData();
    formData.append("file", new Blob(["x"]));
    await apiFetch("/api/backup/restore", { method: "POST", body: formData });
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((init.headers as Headers).has("Content-Type")).toBe(false);
  });
});

describe("apiJson", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the parsed body on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { ok: true })));
    await expect(apiJson("/api/auth/me")).resolves.toEqual({ ok: true });
  });

  it("returns undefined for a 204 response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(apiJson("/api/auth/logout")).resolves.toBeUndefined();
  });

  it("throws an ApiError carrying the status and string error message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(409, { error: "이미 등록된 바코드" })));
    const err = await apiJson("/api/auth/me").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(409);
    expect((err as ApiError).message).toBe("이미 등록된 바코드");
  });

  it("stringifies a structured (zod) error body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(400, { error: { fieldErrors: { name: ["Required"] } } })),
    );
    const err = await apiJson("/api/auth/me").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toContain("Required");
  });
});

type ScriptedXhr =
  | { kind: "error" }
  | { kind: "http"; status: number; body: string };

function installScriptedXhr(script: ScriptedXhr[]) {
  let sent = 0;
  class FakeXHR {
    status = 0;
    responseText = "";
    upload = {
      onprogress: null as ((event: ProgressEvent) => void) | null,
      onload: null as (() => void) | null,
    };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    open() {}
    setRequestHeader() {}
    send() {
      const step = script[Math.min(sent, script.length - 1)];
      sent += 1;
      setTimeout(() => {
        if (step.kind === "error") {
          this.onerror?.();
          return;
        }
        this.status = step.status;
        this.responseText = step.body;
        this.onload?.();
      }, 0);
    }
  }
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
  return {
    sent: () => sent,
  };
}

describe("apiFormUpload", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retries a dropped first POST then succeeds", async () => {
    const xhr = installScriptedXhr([
      { kind: "error" },
      { kind: "http", status: 200, body: JSON.stringify({ id: "att1" }) },
    ]);
    const pending = apiFormUpload("/api/attachments", new FormData());
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual({ id: "att1" });
    expect(xhr.sent()).toBe(2);
  });

  it("retries Cloudflare 502 then succeeds", async () => {
    const xhr = installScriptedXhr([
      { kind: "http", status: 502, body: JSON.stringify({ error: "Bad gateway" }) },
      { kind: "http", status: 201, body: JSON.stringify({ id: "att2" }) },
    ]);
    const pending = apiFormUpload("/api/attachments", new FormData());
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual({ id: "att2" });
    expect(xhr.sent()).toBe(2);
  });

  it("does not retry a per-file 400", async () => {
    const xhr = installScriptedXhr([
      { kind: "http", status: 400, body: JSON.stringify({ error: "지원하지 않는 파일 형식" }) },
    ]);
    const pending = apiFormUpload("/api/attachments", new FormData()).then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    await vi.runAllTimersAsync();
    const outcome = await pending;
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("expected rejection");
    expect(outcome.error).toBeInstanceOf(ApiError);
    expect((outcome.error as ApiError).status).toBe(400);
    expect(xhr.sent()).toBe(1);
  });
});
