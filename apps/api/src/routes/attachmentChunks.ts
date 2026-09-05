import { appendFile, mkdir, unlink } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import {
  UPLOAD_CHUNK_SIZE_BYTES,
  attachmentUploadInitSchema,
} from "@kibble/shared";
import { prisma } from "../lib/prisma.js";
import { t } from "../lib/i18n.js";
import {
  ALLOWED_ATTACHMENT_MIME,
  AttachmentLimitError,
  InvalidAttachmentError,
  MAX_ATTACHMENTS_PER_EVENT,
  finalizeEventAttachmentFromTemp,
  insertEventAttachment,
  removeEventAttachmentFile,
  WritableEventMissingError,
} from "../lib/eventAttachment.js";
import { householdWhere, requireHouseholdWrite } from "../lib/householdScope.js";
import { FILE_SIZE_LIMIT_BYTES, TEMP_DIR } from "../lib/uploads.js";
import {
  acquireChunkWriteLock,
  alignTempFileForWrite,
  createUploadSession,
  deleteUploadSession,
  getUploadSession,
  releaseChunkWriteLock,
} from "../lib/uploadSessions.js";
import { TRANSCODE_STATUS } from "../lib/videoTranscode.js";
import { kickVideoTranscode } from "../jobs/videoTranscode.js";

async function loadWritableEvent(eventId: string, householdId: string) {
  return prisma.event.findFirst({
    where: { id: eventId, ...householdWhere(householdId), deletedAt: null },
    select: { id: true, _count: { select: { attachments: true } } },
  });
}

async function sessionForHousehold(uploadId: string, householdId: string) {
  // 재시작 뒤에는 디스크에서 되살아난다 — 그래서 await다 (K-1: 가구는 여기서 거른다)
  const session = await getUploadSession(uploadId);
  if (!session || session.householdId !== householdId) return undefined;
  return session;
}

export async function attachmentChunkRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.post(
    "/uploads",
    {
      config: {
        rateLimit: { max: 30, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      const householdId = requireHouseholdWrite(request, reply);
      if (!householdId) return;

      const parsed = attachmentUploadInitSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      const { eventId, filename, mimeType, totalSize } = parsed.data;
      if (!ALLOWED_ATTACHMENT_MIME.has(mimeType)) {
        return reply.code(400).send({
          error: t("unsupportedFileType", request.locale, { mimetype: mimeType }),
        });
      }
      if (totalSize > FILE_SIZE_LIMIT_BYTES) {
        const limit = `${Math.floor(FILE_SIZE_LIMIT_BYTES / 1024 / 1024)}MB`;
        return reply.code(413).send({ error: t("fileTooLarge", request.locale, { limit }) });
      }

      const event = await loadWritableEvent(eventId, householdId);
      if (!event) return reply.code(404).send({ error: t("eventNotFound", request.locale) });
      if (event._count.attachments >= MAX_ATTACHMENTS_PER_EVENT) {
        return reply.code(400).send({ error: t("attachmentLimitReached", request.locale) });
      }

      const session = await createUploadSession(eventId, householdId, filename, mimeType, totalSize);
      return reply.code(201).send({ uploadId: session.id });
    },
  );

  app.put("/uploads/:uploadId/chunks/:index", async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const { uploadId, index } = request.params as { uploadId: string; index: string };
    const session = await sessionForHousehold(uploadId, householdId);
    if (!session) return reply.code(404).send({ error: t("uploadSessionNotFound", request.locale) });

    // 인덱스 검사부터 카운터 증가까지가 한 덩어리여야 한다 — 잠금 밖에서 검사하면
    // 같은 인덱스의 동시 요청 둘이 모두 통과해 파일에 두 번 append된다.
    if (!acquireChunkWriteLock(session.id)) {
      return reply.code(409).send({
        error: t("uploadChunkOutOfOrder", request.locale, { expectedIndex: session.nextChunkIndex }),
        expectedIndex: session.nextChunkIndex,
      });
    }
    try {
      const chunkIndex = Number(index);
      if (chunkIndex !== session.nextChunkIndex) {
        return reply.code(409).send({
          error: t("uploadChunkOutOfOrder", request.locale, {
            expectedIndex: session.nextChunkIndex,
          }),
          expectedIndex: session.nextChunkIndex,
        });
      }

      const chunk = request.body as Buffer;
      if (chunk.length > UPLOAD_CHUNK_SIZE_BYTES * 2) {
        return reply
          .code(413)
          .send({ error: t("fileTooLarge", request.locale, { limit: "chunk size" }) });
      }
      if (session.receivedBytes + chunk.length > session.totalSize) {
        return reply.code(400).send({ error: t("uploadChunkOverflow", request.locale) });
      }

      await mkdir(TEMP_DIR, { recursive: true });
      // 재시작으로 되살린 세션이면 크래시가 남긴 꼬리가 있을 수 있다. 되살리기는
      // GET이라 디스크를 못 고치므로(K-7) 수리는 여기서 — append 바로 앞, 쓰기 잠금 안이다.
      await alignTempFileForWrite(session);
      await appendFile(session.tempPath, chunk);
      session.receivedBytes += chunk.length;
      session.nextChunkIndex += 1;

      return { receivedBytes: session.receivedBytes, nextChunkIndex: session.nextChunkIndex };
    } finally {
      releaseChunkWriteLock(session.id);
    }
  });

  app.get("/uploads/:uploadId", async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const { uploadId } = request.params as { uploadId: string };
    const session = await sessionForHousehold(uploadId, householdId);
    if (!session) return reply.code(404).send({ error: t("uploadSessionNotFound", request.locale) });

    return {
      uploadId: session.id,
      eventId: session.eventId,
      receivedBytes: session.receivedBytes,
      nextChunkIndex: session.nextChunkIndex,
      totalSize: session.totalSize,
    };
  });

  app.post("/uploads/:uploadId/complete", async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const { uploadId } = request.params as { uploadId: string };
    const session = await sessionForHousehold(uploadId, householdId);
    if (!session) return reply.code(404).send({ error: t("uploadSessionNotFound", request.locale) });
    if (session.receivedBytes !== session.totalSize) {
      return reply.code(400).send({ error: t("uploadIncomplete", request.locale) });
    }

    const event = await loadWritableEvent(session.eventId, householdId);
    if (!event) {
      await unlink(session.tempPath).catch(() => {});
      await deleteUploadSession(uploadId);
      return reply.code(404).send({ error: t("eventNotFound", request.locale) });
    }
    if (event._count.attachments >= MAX_ATTACHMENTS_PER_EVENT) {
      await unlink(session.tempPath).catch(() => {});
      await deleteUploadSession(uploadId);
      return reply.code(400).send({ error: t("attachmentLimitReached", request.locale) });
    }

    // rename 전에 한 번 더 맞춘다 — 세션이 아는 길이보다 긴 파일을 최종 첨부로 옮기지 않는다
    await alignTempFileForWrite(session).catch(() => {});

    let saved;
    try {
      saved = await finalizeEventAttachmentFromTemp(session.eventId, session.tempPath, session.mimeType);
    } catch (err) {
      await unlink(session.tempPath).catch(() => {});
      await deleteUploadSession(uploadId);
      if (err instanceof InvalidAttachmentError) {
        return reply.code(400).send({ error: t("invalidImageFile", request.locale) });
      }
      throw err;
    }

    let attachment;
    try {
      attachment = await insertEventAttachment(session.eventId, householdId, saved);
    } catch (err) {
      await removeEventAttachmentFile(saved.path, saved.posterPath).catch(() => {});
      await deleteUploadSession(uploadId);
      if (err instanceof AttachmentLimitError) {
        return reply.code(400).send({ error: t("attachmentLimitReached", request.locale) });
      }
      if (err instanceof WritableEventMissingError) {
        return reply.code(404).send({ error: t("eventNotFound", request.locale) });
      }
      throw err;
    }
    await deleteUploadSession(uploadId);
    if (attachment.transcodeStatus === TRANSCODE_STATUS.PENDING) {
      kickVideoTranscode();
    }
    return reply.code(201).send(attachment);
  });

  app.delete("/uploads/:uploadId", async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const { uploadId } = request.params as { uploadId: string };
    const session = await sessionForHousehold(uploadId, householdId);
    if (!session) return reply.code(404).send({ error: t("uploadSessionNotFound", request.locale) });

    await unlink(session.tempPath).catch(() => {});
    await deleteUploadSession(uploadId);
    return reply.code(204).send();
  });
}
