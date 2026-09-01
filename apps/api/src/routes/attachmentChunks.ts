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
  InvalidAttachmentError,
  MAX_ATTACHMENTS_PER_EVENT,
  finalizeEventAttachmentFromTemp,
  type SavedEventAttachment,
} from "../lib/eventAttachment.js";
import { householdWhere, requireHouseholdWrite } from "../lib/householdScope.js";
import { FILE_SIZE_LIMIT_BYTES, TEMP_DIR } from "../lib/uploads.js";
import {
  createUploadSession,
  deleteUploadSession,
  getUploadSession,
} from "../lib/uploadSessions.js";
import { attachmentSelect } from "../lib/attachmentSelect.js";

async function loadWritableEvent(eventId: string, householdId: string) {
  return prisma.event.findFirst({
    where: { id: eventId, ...householdWhere(householdId), deletedAt: null },
    select: { id: true, _count: { select: { attachments: true } } },
  });
}

async function createAttachmentRecord(eventId: string, saved: SavedEventAttachment) {
  return prisma.attachment.create({
    data: {
      eventId,
      path: saved.path,
      mime: saved.mime,
      size: saved.size,
      width: saved.width ?? undefined,
      height: saved.height ?? undefined,
    },
    select: attachmentSelect,
  });
}

function sessionForHousehold(uploadId: string, householdId: string) {
  const session = getUploadSession(uploadId);
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

      const session = createUploadSession(eventId, householdId, filename, mimeType, totalSize);
      return reply.code(201).send({ uploadId: session.id });
    },
  );

  app.put("/uploads/:uploadId/chunks/:index", async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const { uploadId, index } = request.params as { uploadId: string; index: string };
    const session = sessionForHousehold(uploadId, householdId);
    if (!session) return reply.code(404).send({ error: t("uploadSessionNotFound", request.locale) });

    const chunkIndex = Number(index);
    if (chunkIndex !== session.nextChunkIndex) {
      return reply.code(409).send({
        error: t("uploadChunkOutOfOrder", request.locale, { expectedIndex: session.nextChunkIndex }),
        expectedIndex: session.nextChunkIndex,
      });
    }

    const chunk = request.body as Buffer;
    if (chunk.length > UPLOAD_CHUNK_SIZE_BYTES * 2) {
      return reply.code(413).send({ error: t("fileTooLarge", request.locale, { limit: "chunk size" }) });
    }
    if (session.receivedBytes + chunk.length > session.totalSize) {
      return reply.code(400).send({ error: t("uploadChunkOverflow", request.locale) });
    }

    await mkdir(TEMP_DIR, { recursive: true });
    await appendFile(session.tempPath, chunk);
    session.receivedBytes += chunk.length;
    session.nextChunkIndex += 1;

    return { receivedBytes: session.receivedBytes, nextChunkIndex: session.nextChunkIndex };
  });

  app.get("/uploads/:uploadId", async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const { uploadId } = request.params as { uploadId: string };
    const session = sessionForHousehold(uploadId, householdId);
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
    const session = sessionForHousehold(uploadId, householdId);
    if (!session) return reply.code(404).send({ error: t("uploadSessionNotFound", request.locale) });
    if (session.receivedBytes !== session.totalSize) {
      return reply.code(400).send({ error: t("uploadIncomplete", request.locale) });
    }

    const event = await loadWritableEvent(session.eventId, householdId);
    if (!event) {
      await unlink(session.tempPath).catch(() => {});
      deleteUploadSession(uploadId);
      return reply.code(404).send({ error: t("eventNotFound", request.locale) });
    }
    if (event._count.attachments >= MAX_ATTACHMENTS_PER_EVENT) {
      await unlink(session.tempPath).catch(() => {});
      deleteUploadSession(uploadId);
      return reply.code(400).send({ error: t("attachmentLimitReached", request.locale) });
    }

    let saved;
    try {
      saved = await finalizeEventAttachmentFromTemp(session.eventId, session.tempPath, session.mimeType);
    } catch (err) {
      await unlink(session.tempPath).catch(() => {});
      deleteUploadSession(uploadId);
      if (err instanceof InvalidAttachmentError) {
        return reply.code(400).send({ error: t("invalidImageFile", request.locale) });
      }
      throw err;
    }

    const attachment = await createAttachmentRecord(session.eventId, saved);
    deleteUploadSession(uploadId);
    return reply.code(201).send(attachment);
  });

  app.delete("/uploads/:uploadId", async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const { uploadId } = request.params as { uploadId: string };
    const session = sessionForHousehold(uploadId, householdId);
    if (!session) return reply.code(404).send({ error: t("uploadSessionNotFound", request.locale) });

    await unlink(session.tempPath).catch(() => {});
    deleteUploadSession(uploadId);
    return reply.code(204).send();
  });
}
