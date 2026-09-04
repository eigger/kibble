import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { FastifyReply, FastifyRequest } from "fastify";
import { parseByteRange } from "./rangeRequest.js";

export type SendFileOptions = {
  contentType: string;
  /** 없으면 캐시 헤더를 붙이지 않는다 */
  cacheControl?: string;
};

/**
 * 파일을 Range 지원과 함께 보낸다.
 *
 * 예전에는 `createReadStream`을 그대로 돌려줬다 — 그러면 Content-Length도,
 * Accept-Ranges도 없는 chunked 응답이 되어 <video>가 길이를 못 재고 탐색도 못 한다.
 * 큰 영상일수록 티가 난다: 되감을 때마다 처음부터 다시 받는다.
 */
export async function sendFileWithRange(
  request: FastifyRequest,
  reply: FastifyReply,
  absPath: string,
  options: SendFileOptions,
): Promise<NodeJS.ReadableStream | undefined> {
  const fileStat = await stat(absPath);
  const size = fileStat.size;

  reply.header("Accept-Ranges", "bytes");
  reply.header("X-Content-Type-Options", "nosniff");
  reply.type(options.contentType);
  if (options.cacheControl) reply.header("Cache-Control", options.cacheControl);

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
