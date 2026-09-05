"use client";

/**
 * 업로드가 도는 동안 화면이 꺼지지 않게 잡아 둔다.
 *
 * 폰을 내려놓으면 몇십 초 뒤 화면이 잠기고, 그러면 브라우저가 백그라운드로 내려가면서
 * 전송이 멈추거나 끊긴다. 큰 영상이면 몇 분이 걸리니 그 사이 한 번은 겪는다.
 * 이탈 경고([[uploadGuard]])가 사람의 실수를 막는다면 이쪽은 기기의 절전을 막는다.
 *
 * 세 가지가 이 API의 함정이다.
 * 1) 페이지가 숨겨지면 브라우저가 **알아서 해제한다** — 돌아왔을 때 다시 잡아야 한다.
 * 2) 숨겨진 상태에서 요청하면 NotAllowedError로 거절된다 — 보일 때만 요청한다.
 * 3) 요청이 비동기라, 응답을 기다리는 사이에 업로드가 끝났을 수 있다 — 그때는 받자마자 놓는다.
 *
 * 지원하지 않는 브라우저(구형 iOS 등)나 거절은 전부 조용히 넘어간다. 화면 유지는
 * 있으면 좋은 것이지 업로드의 조건이 아니다.
 */

let sentinel: WakeLockSentinel | null = null;
/** 지금 화면을 잡고 있어야 하는가 — 요청이 오가는 사이의 진실은 이 값이다 */
let wanted = false;

function wakeLockApi(): WakeLock | undefined {
  if (typeof navigator === "undefined") return undefined;
  return navigator.wakeLock;
}

async function releaseSentinel(): Promise<void> {
  const held = sentinel;
  sentinel = null;
  if (held) await held.release().catch(() => {});
}

async function acquire(): Promise<void> {
  if (!wanted || sentinel) return;

  const api = wakeLockApi();
  if (!api) return;
  // 숨겨진 상태의 요청은 거절된다. 다시 보일 때 onVisibilityChange가 재시도한다.
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

  try {
    const lock = await api.request("screen");
    if (!wanted) {
      // 기다리는 사이 업로드가 끝났다 — 잡자마자 놓는다
      await lock.release().catch(() => {});
      return;
    }
    sentinel = lock;
    // 브라우저가 스스로 해제하면(화면 잠김 등) 우리 참조도 비워야 재획득이 가능하다
    lock.addEventListener("release", () => {
      if (sentinel === lock) sentinel = null;
    });
  } catch {
    // 미지원·거절 — 업로드는 그대로 진행한다
  }
}

function onVisibilityChange(): void {
  if (typeof document === "undefined") return;
  if (document.visibilityState === "visible") void acquire();
}

/** 업로드가 시작됐다. 여러 번 불러도 잠금은 하나다. */
export function requestScreenWakeLock(): void {
  if (wanted) return;
  wanted = true;
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }
  void acquire();
}

/** 업로드가 끝났다. */
export function releaseScreenWakeLock(): void {
  if (!wanted) return;
  wanted = false;
  if (typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", onVisibilityChange);
  }
  void releaseSentinel();
}

/** 테스트 전용 */
export function isScreenWakeLockHeld(): boolean {
  return sentinel !== null;
}
