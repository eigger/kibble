/**
 * 규칙 기반 최소 파서 (P1-15). 스펙: docs/parsing-benchmark-public.md
 * 예외를 던지지 않는다 — K-12. 실패 줄은 note로 흡수(needsReview true).
 */

import { kstDateTime } from "./kstClock.js";

export type ParseMatchTarget = {
  eventTypeId: string;
  eventTypeKey: string;
  label: string;
  aliases: string[];
  presetId?: string;
  defaultUnit?: string | null;
  sortOrder?: number;
};

export type ParsedLineSuggestion = {
  lineIndex: number;
  rawLine: string;
  eventTypeKey: string;
  eventTypeId: string;
  presetId: string | null;
  quantity: number | null;
  quantityOffered: number | null;
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
  sortOrder: number;
};

const UNIT_ALT = "g|kg|ml|mL|l|L|개|회|분|정";
const QUANTITY_SINGLE_RE = new RegExp(`(~?\\d+(?:\\.\\d+)?)\\s*(${UNIT_ALT})(?![a-zA-Z])`, "i");
const QUANTITY_RANGE_RE = new RegExp(
  `(\\d+(?:\\.\\d+)?)\\s*~\\s*(\\d+(?:\\.\\d+)?)\\s*(${UNIT_ALT})(?![a-zA-Z])`,
  "i",
);
const OFFERED_CONSUMED_RE = new RegExp(
  `(\\d+(?:\\.\\d+)?)\\s*(${UNIT_ALT})\\s*(?:줬는데|주고)\\s*(\\d+(?:\\.\\d+)?)\\s*(${UNIT_ALT})`,
  "i",
);
const WEIGHT_INLINE_RE = /^(\d+(?:\.\d+)?)\s*(kg|g)\s*$/i;

const TIME_PM_RE = /오후\s*(\d{1,2})\s*시(?:\s*(?:(\d{1,2})\s*분)?)?/;
const TIME_AM_RE = /오전\s*(\d{1,2})\s*시(?:\s*(?:(\d{1,2})\s*분)?)?/;
const TIME_HM_RE = /(\d{1,2})\s*시\s*(?:(\d{1,2})\s*분)?/;

const RELATIVE_DAY_RE = /(그제|어제)/;
const RELATIVE_SLOT: Record<string, number> = {
  새벽: 4,
  아침: 8,
  점심: 12,
  오후: 15,
  저녁: 19,
  밤: 22,
};
const RELATIVE_SLOT_RE = /(새벽|아침|점심|오후|저녁|밤)/;

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
        sortOrder: t.sortOrder ?? 999,
      });
    }
  }
  return hits.sort((a, b) => b.keyword.length - a.keyword.length);
}

function stripMatch(line: string, m: RegExpMatchArray): string {
  return (line.slice(0, m.index!) + line.slice(m.index! + m[0].length)).trim();
}

function normalizeRange(low: string, high: string): [number, number] {
  let lo = Number(low);
  const hi = Number(high);
  const loDigits = String(Math.trunc(lo)).length;
  const hiDigits = String(Math.trunc(hi)).length;
  if (lo <= hi && loDigits < hiDigits) {
    const scaled = lo * 10 ** (hiDigits - loDigits);
    if (scaled <= hi) lo = scaled;
  }
  return [lo, hi];
}

function normalizeUnit(raw: string): string {
  const u = raw.toLowerCase();
  return u === "l" ? "L" : u;
}

type QuantityParse = {
  quantity: number | null;
  quantityOffered: number | null;
  unit: string | null;
  rangeConverted: boolean;
  rest: string;
};

function parseQuantities(line: string): QuantityParse {
  let working = line;
  let quantityOffered: number | null = null;
  let quantity: number | null = null;
  let unit: string | null = null;
  let rangeConverted = false;

  const offered = line.match(OFFERED_CONSUMED_RE);
  if (offered) {
    quantityOffered = Number(offered[1]);
    quantity = Number(offered[3]);
    unit = normalizeUnit(offered[2]!);
    working = stripMatch(line, offered);
    return { quantity, quantityOffered, unit, rangeConverted, rest: working };
  }

  const range = working.match(QUANTITY_RANGE_RE);
  if (range) {
    const [lo, hi] = normalizeRange(range[1]!, range[2]!);
    quantity = (lo + hi) / 2;
    unit = normalizeUnit(range[3]!);
    rangeConverted = true;
    working = stripMatch(working, range);
    return { quantity, quantityOffered, unit, rangeConverted, rest: working };
  }

  const single = working.match(QUANTITY_SINGLE_RE);
  if (single) {
    quantity = Number(single[1]!.replace(/^~/, ""));
    unit = normalizeUnit(single[2]!);
    working = stripMatch(working, single);
  }

  const weightOnly = working.match(WEIGHT_INLINE_RE);
  if (weightOnly && quantity == null) {
    quantity = Number(weightOnly[1]);
    unit = normalizeUnit(weightOnly[2]!);
    working = "";
  }

  return { quantity, quantityOffered, unit, rangeConverted, rest: working };
}

type TimeParse = {
  occurredAt: Date | null;
  relativeEstimate: boolean;
  rest: string;
};

function parseTime(line: string, now: Date): TimeParse {
  let working = line;
  let dayOffset = 0;

  const dayMatch = working.match(RELATIVE_DAY_RE);
  if (dayMatch) {
    dayOffset = dayMatch[1] === "그제" ? -2 : -1;
    working = stripMatch(working, dayMatch);
  }

  if (/방금|just now/i.test(working)) {
    working = working.replace(/방금|just now/gi, "").trim();
    return { occurredAt: now, relativeEstimate: false, rest: working };
  }

  let m = working.match(TIME_PM_RE);
  if (m) {
    let hour = Number(m[1]);
    const minute = m[2] ? Number(m[2]) : 0;
    if (hour < 12) hour += 12;
    return {
      occurredAt: kstDateTime(now, hour, minute, dayOffset),
      relativeEstimate: dayOffset !== 0,
      rest: stripMatch(working, m),
    };
  }

  m = working.match(TIME_AM_RE);
  if (m) {
    const hour = Number(m[1]) % 12;
    const minute = m[2] ? Number(m[2]) : 0;
    return {
      occurredAt: kstDateTime(now, hour, minute, dayOffset),
      relativeEstimate: dayOffset !== 0,
      rest: stripMatch(working, m),
    };
  }

  m = working.match(TIME_HM_RE);
  if (m) {
    const hour = Number(m[1]);
    const minute = m[2] ? Number(m[2]) : 0;
    return {
      occurredAt: kstDateTime(now, hour, minute, dayOffset),
      relativeEstimate: dayOffset !== 0,
      rest: stripMatch(working, m),
    };
  }

  const slot = working.match(RELATIVE_SLOT_RE);
  if (slot) {
    const hour = RELATIVE_SLOT[slot[1]!] ?? 12;
    return {
      occurredAt: kstDateTime(now, hour, 0, dayOffset),
      relativeEstimate: true,
      rest: stripMatch(working, slot),
    };
  }

  if (dayOffset !== 0) {
    return { occurredAt: kstDateTime(now, 12, 0, dayOffset), relativeEstimate: true, rest: working };
  }

  return { occurredAt: null, relativeEstimate: false, rest: working };
}

function keywordAtBoundary(text: string, keyword: string): boolean {
  if (text.includes(keyword)) return true;
  return false;
}

function findTypeHits(rest: string, hits: KeywordHit[]): KeywordHit[] {
  const byKey = new Map<string, KeywordHit>();
  for (const hit of hits) {
    if (!keywordAtBoundary(rest, hit.keyword)) continue;
    const existing = byKey.get(hit.eventTypeKey);
    if (!existing || hit.sortOrder < existing.sortOrder) {
      byKey.set(hit.eventTypeKey, hit);
    }
  }
  return [...byKey.values()].sort((a, b) => a.sortOrder - b.sortOrder);
}

function noteFallback(rawLine: string, noteEventTypeId: string): ParsedLineSuggestion {
  return {
    lineIndex: 0,
    rawLine,
    eventTypeKey: "note",
    eventTypeId: noteEventTypeId,
    presetId: null,
    quantity: null,
    quantityOffered: null,
    unit: null,
    occurredAt: null,
    needsReview: true,
    note: rawLine,
  };
}

function parseLine(
  rawLine: string,
  lineIndex: number,
  hits: KeywordHit[],
  targets: ParseMatchTarget[],
  noteEventTypeId: string,
  now: Date,
): ParsedLineSuggestion {
  const time = parseTime(rawLine, now);
  let working = time.rest;
  const qty = parseQuantities(working);
  working = qty.rest;

  const typeHits = findTypeHits(working, hits);
  let resolvedHits = typeHits;

  if (resolvedHits.length === 0 && qty.quantityOffered != null) {
    const meal = targets.find((t) => t.eventTypeKey === "meal");
    if (meal) {
      resolvedHits = [
        {
          eventTypeId: meal.eventTypeId,
          eventTypeKey: meal.eventTypeKey,
          presetId: meal.presetId ?? null,
          keyword: "meal",
          sortOrder: meal.sortOrder ?? 10,
        },
      ];
    }
  }

  if (resolvedHits.length === 0 && qty.quantity != null && (qty.unit === "kg" || qty.unit === "g")) {
    const weight = targets.find((t) => t.eventTypeKey === "weight");
    if (weight && (working === "" || WEIGHT_INLINE_RE.test(rawLine.trim()))) {
      resolvedHits = [
        {
          eventTypeId: weight.eventTypeId,
          eventTypeKey: weight.eventTypeKey,
          presetId: weight.presetId ?? null,
          keyword: "weight",
          sortOrder: weight.sortOrder ?? 80,
        },
      ];
    }
  }

  if (resolvedHits.length === 0) {
    const note = noteFallback(rawLine, noteEventTypeId);
    note.lineIndex = lineIndex;
    if (time.occurredAt) note.occurredAt = time.occurredAt;
    if (qty.quantity != null) {
      note.quantity = qty.quantity;
      note.unit = qty.unit;
    }
    if (qty.quantityOffered != null) note.quantityOffered = qty.quantityOffered;
    return note;
  }

  const chosen = resolvedHits[0]!;
  const target = targets.find((t) => t.eventTypeId === chosen.eventTypeId);
  const resolvedUnit = qty.unit ?? target?.defaultUnit ?? null;

  let needsReview = false;
  if (resolvedHits.length > 1) needsReview = true;
  if (time.relativeEstimate) needsReview = true;
  if (qty.rangeConverted) needsReview = true;

  const noteText = working
    .replace(chosen.keyword, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    lineIndex,
    rawLine,
    eventTypeKey: chosen.eventTypeKey,
    eventTypeId: chosen.eventTypeId,
    presetId: chosen.presetId,
    quantity: qty.quantity,
    quantityOffered: qty.quantityOffered,
    unit: resolvedUnit,
    occurredAt: time.occurredAt,
    needsReview,
    note: noteText || null,
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

  return lines.map((rawLine, lineIndex) =>
    parseLine(rawLine, lineIndex, hits, targets, noteEventTypeId, now),
  );
}
