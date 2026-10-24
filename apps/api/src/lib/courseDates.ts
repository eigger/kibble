/**
 * 종료일이 시작일보다 앞서면 시작일로 보정한다. 입력을 거부하지 않는다(K-12) —
 * 서버가 조용히 맞춘다.
 */
export function clampEndDate(start: Date, end: Date | undefined): Date | undefined;
export function clampEndDate(start: Date, end: Date | null): Date | null;
export function clampEndDate(start: Date, end: Date | null | undefined): Date | null | undefined {
  if (!end) return end;
  return end.getTime() < start.getTime() ? new Date(start.getTime()) : end;
}
