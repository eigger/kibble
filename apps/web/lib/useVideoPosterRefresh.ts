"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";
import { apiJson } from "./api";
import {
  POSTER_POLL_DELAYS_MS,
  applyPosterStatuses,
  pendingPosterIds,
  type PosterStatus,
} from "./videoPosterRefresh";
import type { TimelineEvent } from "./types";

/**
 * 포스터가 아직 없는 영상이 화면에 있으면 그 첨부의 상태만 몇 번 되묻는다.
 *
 * 목록 전체를 다시 받지 않는다 — 업로드가 도는 중에 목록을 갈아끼우면 낙관적으로
 * 붙여둔 첨부가 사라진다. 상태만 받아 제자리에 덮는다.
 *
 * 화면이 가려져 있으면 쉰다. 대기 목록이 비면 멈춘다 — 무한 폴링은 만들지 않는다.
 */
export function useVideoPosterRefresh(
  events: TimelineEvent[],
  setEvents: Dispatch<SetStateAction<TimelineEvent[]>>,
): void {
  const pending = pendingPosterIds(events);
  // useState의 setter는 안정적이라 의존성에 그대로 둔다 (useMergeUploadedAttachments와 같다).
  const key = pending.join(",");

  useEffect(() => {
    if (!key) return;
    const ids = key.split(",");
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const schedule = () => {
      const delay = POSTER_POLL_DELAYS_MS[attempt];
      // 정해진 횟수를 다 쓰면 그만둔다. 다음 목록 갱신이나 재방문이 이어받는다.
      if (delay === undefined) return;
      attempt += 1;
      timer = setTimeout(run, delay);
    };

    const run = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        schedule();
        return;
      }
      try {
        const rows = await apiJson<PosterStatus[]>(
          `/api/attachments/posters?ids=${encodeURIComponent(ids.join(","))}`,
        );
        if (cancelled) return;
        const filled = rows.filter((row) => Boolean(row.posterPath));
        if (filled.length > 0) {
          setEvents((prev) => applyPosterStatuses(prev, rows));
        }
        // 전부 채워졌으면 더 물을 것이 없다. 남은 것은 다음 주기에 다시 본다.
        if (filled.length === ids.length) return;
      } catch {
        // 네트워크·401 — 썸네일은 있으면 좋은 것이다. 조용히 다음 주기로 (K-12)
      }
      schedule();
    };

    schedule();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [key, setEvents]);
}
