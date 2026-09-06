import type { TimelineEvent } from "./types";

export type PosterStatus = {
  id: string;
  posterPath?: string | null;
  transcodeStatus?: string | null;
};

/** 폴링 간격. 변환 잡은 업로드 완료에서 곧장 깨어나므로 앞을 촘촘히 둔다. */
export const POSTER_POLL_DELAYS_MS = [2_000, 4_000, 7_000, 12_000, 20_000, 30_000, 30_000, 30_000];

/**
 * 포스터를 아직 못 받은 영상 첨부 id.
 *
 * 업로드 응답에는 `posterPath: null`이 담긴다 — 대표 프레임은 변환 잡이 뒤에서 만든다.
 * 목록은 그 사실을 알 방법이 없어 다시 불러오기 전까지 자리표시자나 맨 `<video>`로
 * 남았고, 그게 "방금 올린 영상만 썸네일이 안 나온다"였다.
 *
 * `failed`까지 포함한다 — 변환이 죽어도 포스터는 따로 붙을 수 있다(서버가 변환보다
 * 먼저 뽑는다). 반대로 포스터가 이미 있으면 상태와 무관하게 볼 일이 없다.
 */
export function pendingPosterIds(events: TimelineEvent[]): string[] {
  const ids: string[] = [];
  for (const event of events) {
    for (const attachment of event.attachments ?? []) {
      if (!attachment.mime?.startsWith("video/")) continue;
      if (attachment.posterPath) continue;
      ids.push(attachment.id);
    }
  }
  return ids.sort();
}

/** 받아온 상태를 목록에 덮어쓴다. 바뀐 게 없으면 같은 배열을 돌려준다 — 리렌더를 아낀다. */
export function applyPosterStatuses(
  events: TimelineEvent[],
  statuses: PosterStatus[],
): TimelineEvent[] {
  if (statuses.length === 0) return events;
  const byId = new Map(statuses.map((row) => [row.id, row]));
  let touched = false;

  const next = events.map((event) => {
    const attachments = event.attachments;
    if (!attachments || attachments.length === 0) return event;
    let eventTouched = false;

    const merged = attachments.map((attachment) => {
      const row = byId.get(attachment.id);
      if (!row) return attachment;
      const posterPath = row.posterPath ?? attachment.posterPath ?? null;
      const transcodeStatus = row.transcodeStatus ?? attachment.transcodeStatus ?? null;
      if (posterPath === (attachment.posterPath ?? null) && transcodeStatus === (attachment.transcodeStatus ?? null)) {
        return attachment;
      }
      eventTouched = true;
      return { ...attachment, posterPath, transcodeStatus };
    });

    if (!eventTouched) return event;
    touched = true;
    return { ...event, attachments: merged };
  });

  return touched ? next : events;
}
