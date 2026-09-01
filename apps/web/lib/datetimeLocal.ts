import { kstCalendarParts, kstDateTime } from "@kibble/shared";

const DATETIME_LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** ISO instant → datetime-local (Phase 1 KST 벽시계 — WORKPLAN §7.11) */
export function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const p = kstCalendarParts(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  const shifted = new Date(d.getTime() + 9 * 60 * 60_000);
  return `${p.year}-${pad(p.month + 1)}-${pad(p.date)}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

/** datetime-local(KST 벽시계) → ISO instant. 무효·빈 값은 null. */
export function fromDatetimeLocalValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const m = DATETIME_LOCAL_RE.exec(trimmed);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  if ([year, month, day, hour, minute].some((n) => Number.isNaN(n))) return null;
  const anchor = new Date(Date.UTC(year, month - 1, day));
  const instant = kstDateTime(anchor, hour, minute, 0);
  if (Number.isNaN(instant.getTime())) return null;
  return instant.toISOString();
}

export type ParsedOptionalNumber =
  | { ok: true; value: number | null }
  | { ok: false; invalid: true };

export function parseOptionalNumber(raw: string): ParsedOptionalNumber {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return { ok: false, invalid: true };
  return { ok: true, value: n };
}
