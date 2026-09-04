import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FakeLock = {
  release: ReturnType<typeof vi.fn>;
  addEventListener: (type: string, fn: () => void) => void;
  fireRelease: () => void;
};

type FakeApi = {
  request: ReturnType<typeof vi.fn>;
  locks: FakeLock[];
};

function makeLock(): FakeLock {
  const listeners: (() => void)[] = [];
  const lock: FakeLock = {
    release: vi.fn(async () => {}),
    addEventListener: (type, fn) => {
      if (type === "release") listeners.push(fn);
    },
    fireRelease: () => listeners.forEach((fn) => fn()),
  };
  return lock;
}

/** request가 언제 끝날지 테스트가 정하고 싶을 때 gate를 넘긴다 */
function installWakeLock(gate?: Promise<void>): FakeApi {
  const api: FakeApi = {
    locks: [],
    request: vi.fn(async () => {
      if (gate) await gate;
      const lock = makeLock();
      api.locks.push(lock);
      return lock;
    }),
  };
  Object.defineProperty(navigator, "wakeLock", { configurable: true, value: api });
  return api;
}

function setVisibility(state: "visible" | "hidden"): void {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

async function loadModule() {
  vi.resetModules();
  return import("./screenWakeLock");
}

describe("screenWakeLock", () => {
  beforeEach(() => {
    setVisibility("visible");
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, "wakeLock");
    setVisibility("visible");
    vi.resetModules();
  });

  // 지원하지 않는 브라우저(구형 iOS 등)에서도 업로드는 그대로 굴러가야 한다
  it("does nothing when the API is missing", async () => {
    Reflect.deleteProperty(navigator, "wakeLock");
    const mod = await loadModule();
    expect(() => mod.requestScreenWakeLock()).not.toThrow();
    expect(() => mod.releaseScreenWakeLock()).not.toThrow();
    expect(mod.isScreenWakeLockHeld()).toBe(false);
  });

  it("holds one lock while uploading and lets it go at the end", async () => {
    const api = installWakeLock();
    const mod = await loadModule();

    mod.requestScreenWakeLock();
    await vi.waitFor(() => expect(mod.isScreenWakeLockHeld()).toBe(true));
    expect(api.request).toHaveBeenCalledTimes(1);

    mod.requestScreenWakeLock(); // 이미 잡고 있으면 다시 요청하지 않는다
    expect(api.request).toHaveBeenCalledTimes(1);

    mod.releaseScreenWakeLock();
    await vi.waitFor(() => expect(api.locks[0].release).toHaveBeenCalled());
    expect(mod.isScreenWakeLockHeld()).toBe(false);
  });

  // 숨겨진 상태의 요청은 NotAllowedError로 거절된다 — 애초에 부르지 않는다
  it("waits for the page to become visible before asking", async () => {
    const api = installWakeLock();
    setVisibility("hidden");
    const mod = await loadModule();

    mod.requestScreenWakeLock();
    expect(api.request).not.toHaveBeenCalled();

    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(mod.isScreenWakeLockHeld()).toBe(true));

    mod.releaseScreenWakeLock();
  });

  // 화면이 잠기면 브라우저가 알아서 해제한다 — 돌아왔을 때 다시 잡아야 의미가 있다
  it("re-acquires after the browser drops the lock on its own", async () => {
    const api = installWakeLock();
    const mod = await loadModule();

    mod.requestScreenWakeLock();
    await vi.waitFor(() => expect(mod.isScreenWakeLockHeld()).toBe(true));

    api.locks[0].fireRelease();
    expect(mod.isScreenWakeLockHeld()).toBe(false);

    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(api.request).toHaveBeenCalledTimes(2));
    expect(mod.isScreenWakeLockHeld()).toBe(true);

    mod.releaseScreenWakeLock();
  });

  // 요청이 비동기라 응답을 기다리는 사이 업로드가 끝날 수 있다
  it("releases a lock that arrives after the upload finished", async () => {
    let openGate = () => {};
    const gate = new Promise<void>((resolve) => {
      openGate = resolve;
    });
    const api = installWakeLock(gate);
    const mod = await loadModule();

    mod.requestScreenWakeLock();
    mod.releaseScreenWakeLock();
    openGate();

    await vi.waitFor(() => expect(api.locks).toHaveLength(1));
    await vi.waitFor(() => expect(api.locks[0].release).toHaveBeenCalled());
    expect(mod.isScreenWakeLockHeld()).toBe(false);
  });

  it("stops listening for visibility once released", async () => {
    const api = installWakeLock();
    const mod = await loadModule();

    mod.requestScreenWakeLock();
    await vi.waitFor(() => expect(mod.isScreenWakeLockHeld()).toBe(true));
    mod.releaseScreenWakeLock();
    await vi.waitFor(() => expect(mod.isScreenWakeLockHeld()).toBe(false));

    document.dispatchEvent(new Event("visibilitychange"));
    expect(api.request).toHaveBeenCalledTimes(1);
  });

  it("survives a rejected request", async () => {
    const api: FakeApi = {
      locks: [],
      request: vi.fn(async () => {
        throw new DOMException("denied", "NotAllowedError");
      }),
    };
    Object.defineProperty(navigator, "wakeLock", { configurable: true, value: api });
    const mod = await loadModule();

    mod.requestScreenWakeLock();
    await vi.waitFor(() => expect(api.request).toHaveBeenCalled());
    expect(mod.isScreenWakeLockHeld()).toBe(false);
    mod.releaseScreenWakeLock();
  });
});
