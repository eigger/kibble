import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { FastifyReply, FastifyRequest } from "fastify";
import { parseByteRange } from "./rangeRequest.js";

export type SendFileOptions = {
  contentType: string;
  /** 없으면 캐시 헤더를 붙이지 않는다 */
  cacheControl?: string;
};

/** size + mtime(초). 바꿔 끼우면 값이 바뀌어 다음 재검증이 본문을 다시 받는다. */
export function fileEtag(size: number, mtimeMs: number): string {
  return `"${size.toString(16)}-${Math.floor(mtimeMs / 1000).toString(16)}"`;
}

export function etagMatched(ifNoneMatch: string, etag: string): boolean {
  if (ifNoneMatch.trim() === "*") return true;
  return ifNoneMatch.split(",").some((token) => token.trim() === etag);
}

/**
 * Range가 있으면 304를 주지 않는다 — <video>가 탐색할 때 If-None-Match와 Range를
 * 같이 보내면 304는 바이트가 아니라서 재생이 멈춘다.
 */
export function shouldRespondNotModified(input: {
  range?: string;
  ifNoneMatch?: string;
  ifModifiedSince?: string;
  etag: string;
  mtimeMs: number;
}): boolean {
  if (input.range) return false;
  if (input.ifNoneMatch) return etagMatched(input.ifNoneMatch, input.etag);
  if (!input.ifModifiedSince) return false;
  const since = Date.parse(input.ifModifiedSince);
  if (!Number.isFinite(since)) return false;
  return Math.floor(input.mtimeMs / 1000) <= Math.floor(since / 1000);
}

function headerString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value.join(", ");
  return value;
}

/**
 * 파일을 Range 지원과 함께 보낸다.
 *
 * 예전에는 `createReadStream`을 그대로 돌려줬다 — 그러면 Content-Length도,
 * Accept-Ranges도 없는 chunked 응답이 되어 <video>가 길이를 못 재고 탐색도 못 한다.
 * 큰 영상일수록 티가 난다: 되감을 때마다 처음부터 다시 받는다.
 *
 * ETag·Last-Modified가 있어야 must-revalidate가 304를 낸다. 검증자 없이 max-age=0이면
 * 재검증이 곧 전체 재다운로드다.
 */
export async function sendFileWithRange(
  request: FastifyRequest,
  reply: FastifyReply,
  absPath: string,
  options: SendFileOptions,
): Promise<NodeJS.ReadableStream | undefined> {
  const fileStat = await stat(absPath);
  const size = fileStat.size;
  const mtimeMs = fileStat.mtimeMs;
  const etag = fileEtag(size, mtimeMs);
  const lastModified = fileStat.mtime.toUTCString();

  reply.header("Accept-Ranges", "bytes");
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("ETag", etag);
  reply.header("Last-Modified", lastModified);
  reply.type(options.contentType);
  if (options.cacheControl) reply.header("Cache-Control", options.cacheControl);

  if (
    shouldRespondNotModified({
      range: headerString(request.headers.range),
      ifNoneMatch: headerString(request.headers["if-none-match"]),
      ifModifiedSince: headerString(request.headers["if-modified-since"]),
      etag,
      mtimeMs,
    })
  ) {
    reply.code(304).send();
    return undefined;
  }

  const parsed = parseByteRange(request.headers.range, size);

  if (parsed.kind === "unsatisfiable") {
    reply.header("Content-Range", `bytes */${size}`);
    reply.code(416).send();
    return undefined;
  }

  if (parsed.kind === "range") {
    const { start, end } = parsed.range;
    reply.code(206);
    reply.header("Content-Range", `bytes ${start}-${end}/${size}`);
    reply.header("Content-Length", String(end - start + 1));
    return createReadStream(absPath, { start, end });
  }

  reply.header("Content-Length", String(size));
  return createReadStream(absPath);
}
