/**
 * 규칙 기반 최소 파서 (P1-15). 예외를 던지지 않는다 — K-12.
 * 실패 줄은 eventTypeKey "note"로 폴백한다.
 */

export type ParseMatchTarget = {
  eventTypeId: string;
  eventTypeKey: string;
  label: string;
  aliases: string[];
  presetId?: string;
  defaultUnit?: string | null;
};

export type ParsedLineSuggestion = {
  rawLine: string;
  eventTypeKey: string;
  eventTypeId: string;
  presetId: string | null;
  quantity: number | null;
  unit: string | null;
  occurredAt: Date | null;
  needsReview: boolean;
  note: string | null;
};

type KeywordHit = {
  eventTypeId: string;
  eventTypeKey: string;
  presetId: string | null;
  keyword: string;
};

const QUANTITY_RE = /(~?\d+(?:\.\d+)?)\s*(g|kg|ml|mL|l|L|개|회|분|정)\b/i;
const TIME_HM_RE = /(\d{1,2})\s*시\s*(?:(\d{1,2})\s*분)?/;
const TIME_PM_RE = /오후\s*(\d{1,2})\s*시(?:\s*(?:(\d{1,2})\s*분)?)?/;
const TIME_AM_RE = /오전\s*(\d{1,2})\s*시(?:\s*(?:(\d{1,2})\s*분)?)?/;

function buildKeywordHits(targets: ParseMatchTarget[]): KeywordHit[] {
  const hits: KeywordHit[] = [];
  for (const t of targets) {
    const keywords = new Set<string>();
    for (const alias of t.aliases) {
      if (alias.trim()) keywords.add(alias.trim());
    }
    if (t.label.startsWith("eventType.")) {
      keywords.add(t.label.slice("eventType.".length));
    } else if (t.label.trim()) {
      keywords.add(t.label.trim());
    }
    keywords.add(t.eventTypeKey);

    for (const keyword of keywords) {
      hits.push({
        eventTypeId: t.eventTypeId,
        eventTypeKey: t.eventTypeKey,
        presetId: t.presetId ?? null,
        keyword,
      });
    }
  }
  return hits.sort((a, b) => b.keyword.length - a.keyword.length);
}

function parseQuantity(line: string): { quantity: number | null; unit: string | null; rest: string } {
  const m = line.match(QUANTITY_RE);
  if (!m) return { quantity: null, unit: null, rest: line };
  const rawNum = m[1]!.replace(/^~/, "");
  const quantity = Number(rawNum);
  if (!Number.isFinite(quantity)) return { quantity: null, unit: null, rest: line };
  let unit = m[2]!.toLowerCase();
  if (unit === "l") unit = "L";
  const rest = line.slice(0, m.index!) + line.slice(m.index! + m[0].length);
  return { quantity, unit, rest: rest.trim() };
}

function parseTime(line: string, now: Date): { occurredAt: Date | null; rest: string } {
  if (/방금|just now/i.test(line)) {
    return { occurredAt: now, rest: line.replace(/방금|just now/gi, "").trim() };
  }

  let m = line.match(TIME_PM_RE);
  if (m) {
    let hour = Number(m[1]);
    const minute = m[2] ? Number(m[2]) : 0;
    if (hour < 12) hour += 12;
    const d = applyClock(now, hour, minute);
    return { occurredAt: d, rest: stripMatch(line, m) };
  }

  m = line.match(TIME_AM_RE);
  if (m) {
    const hour = Number(m[1]) % 12;
    const minute = m[2] ? Number(m[2]) : 0;
    const d = applyClock(now, hour, minute);
    return { occurredAt: d, rest: stripMatch(line, m) };
  }

  m = line.match(TIME_HM_RE);
  if (m) {
    const hour = Number(m[1]);
    const minute = m[2] ? Number(m[2]) : 0;
    const d = applyClock(now, hour, minute);
    return { occurredAt: d, rest: stripMatch(line, m) };
  }

  return { occurredAt: null, rest: line };
}

function applyClock(base: Date, hour: number, minute: number): Date {
  const d = new Date(base);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function stripMatch(line: string, m: RegExpMatchArray): string {
  return (line.slice(0, m.index!) + line.slice(m.index! + m[0].length)).trim();
}

function matchType(rest: string, hits: KeywordHit[]): KeywordHit | null {
  for (const hit of hits) {
    if (rest.includes(hit.keyword)) return hit;
  }
  return null;
}

function noteFallback(rawLine: string, noteEventTypeId: string): ParsedLineSuggestion {
  return {
    rawLine,
    eventTypeKey: "note",
    eventTypeId: noteEventTypeId,
    presetId: null,
    quantity: null,
    unit: null,
    occurredAt: null,
    needsReview: false,
    note: rawLine,
  };
}

export function parseEntryText(
  text: string,
  targets: ParseMatchTarget[],
  noteEventTypeId: string,
  now: Date = new Date(),
): ParsedLineSuggestion[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const hits = buildKeywordHits(targets);
  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  return lines.map((rawLine) => {
    let working = rawLine;
    const { occurredAt, rest: afterTime } = parseTime(working, now);
    working = afterTime;
    const { quantity, unit, rest: afterQty } = parseQuantity(working);
    working = afterQty;

    const typeHit = matchType(working, hits);
    if (!typeHit) {
      const note = noteFallback(rawLine, noteEventTypeId);
      if (occurredAt) note.occurredAt = occurredAt;
      if (quantity != null) {
        note.quantity = quantity;
        note.unit = unit;
      }
      return note;
    }

    const target = targets.find((t) => t.eventTypeId === typeHit.eventTypeId);
    const resolvedUnit = unit ?? target?.defaultUnit ?? null;

    return {
      rawLine,
      eventTypeKey: typeHit.eventTypeKey,
      eventTypeId: typeHit.eventTypeId,
      presetId: typeHit.presetId,
      quantity,
      unit: resolvedUnit,
      occurredAt,
      needsReview: quantity == null && typeHit.eventTypeKey !== "note",
      note: working.replace(typeHit.keyword, "").trim() || null,
    };
  });
}
