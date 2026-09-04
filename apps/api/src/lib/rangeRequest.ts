/**
 * `Range: bytes=...` 파싱. RFC 9110 §14.1.
 *
 * 영상 재생에 필수다 — 브라우저는 <video>를 열 때 먼저 메타데이터 구간만 요청하고,
 * 탐색할 때마다 그 위치의 바이트만 다시 요청한다. 서버가 200으로 전체를 돌려주면
 * 탐색이 매번 처음부터 다시 받는 일이 되고, iOS Safari는 재생을 거부하기도 한다.
 *
 * 구현 범위는 **단일 구간**까지다. 다중 구간(`bytes=0-9,20-29`)은 multipart/byteranges
 * 응답이 필요한데 미디어 재생에는 쓰이지 않는다 — 스펙이 허용하는 대로 무시하고
 * 전체를 돌려준다.
 */

export type ByteRange = { start: number; end: number };

export type RangeParse =
  /** 헤더가 없거나 이해할 수 없다 — 200으로 전체를 보낸다 */
  | { kind: "none" }
  | { kind: "range"; range: ByteRange }
  /** 파일 끝을 넘어선 요청 — 416 */
  | { kind: "unsatisfiable" };

const NONE: RangeParse = { kind: "none" };

function parseInteger(text: string): number | null {
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) ? value : null;
}

export function parseByteRange(
  // Node는 중복 헤더를 보통 하나로 합치지만 타입상 배열이 올 수 있다 — 여기서 터지면
  // 라우트의 catch가 "디스크에 파일 없음" 404로 삼켜 버려 원인을 못 찾는다.
  header: string | string[] | undefined | null,
  size: number,
): RangeParse {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return NONE;

  const spec = raw.trim().toLowerCase();
  if (!spec.startsWith("bytes=")) return NONE;

  const value = spec.slice("bytes=".length).trim();
  // 다중 구간은 지원하지 않는다 — 무시하고 전체를 보낸다 (스펙상 허용)
  if (!value || value.includes(",")) return NONE;

  const dash = value.indexOf("-");
  if (dash === -1) return NONE;

  const rawStart = value.slice(0, dash).trim();
  const rawEnd = value.slice(dash + 1).trim();

  // suffix 형식 `bytes=-500` — 끝에서 500바이트
  if (rawStart === "") {
    const suffix = parseInteger(rawEnd);
    if (suffix === null) return NONE;
    if (size === 0) return { kind: "unsatisfiable" };
    if (suffix === 0) return { kind: "unsatisfiable" };
    const start = Math.max(0, size - suffix);
    return { kind: "range", range: { start, end: size - 1 } };
  }

  const start = parseInteger(rawStart);
  if (start === null) return NONE;
  // 빈 파일에는 만족시킬 수 있는 구간이 없다
  if (size === 0 || start >= size) return { kind: "unsatisfiable" };

  if (rawEnd === "") {
    return { kind: "range", range: { start, end: size - 1 } };
  }

  const end = parseInteger(rawEnd);
  if (end === null) return NONE;
  // 뒤집힌 구간은 잘못된 요청이다 — 무시하고 전체를 보낸다
  if (end < start) return NONE;

  return { kind: "range", range: { start, end: Math.min(end, size - 1) } };
}
