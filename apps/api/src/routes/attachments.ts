import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { t } from "../lib/i18n.js";
import { resolveMediaViewerHouseholdId } from "../lib/attachmentAccess.js";
import {
  ALLOWED_ATTACHMENT_MIME,
  InvalidAttachmentError,
  MAX_ATTACHMENTS_PER_EVENT,
  attachmentAbsolutePath,
  removeEventAttachmentFile,
  saveEventAttachment,
} from "../lib/eventAttachment.js";
import { householdWhere, requireHouseholdWrite } from "../lib/householdScope.js";
import { attachmentSelect } from "../lib/attachmentSelect.js";

export { attachmentSelect };

function safeContentType(mime: string): string {
  return ALLOWED_ATTACHMENT_MIME.has(mime) ? mime : "application/octet-stream";
}

export async function mediaAttachmentRoutes(app: FastifyInstance) {
  app.get("/file/*", async (request, reply) => {
    const relPath = (request.params as { "*": string })["*"]?.trim();
    if (!relPath || relPath.includes("..")) {
      return reply.code(404).send({ error: t("fileNotFound", request.locale) });
    }

    const viewerHouseholdId = await resolveMediaViewerHouseholdId(app, request, reply);
    if (viewerHouseholdId === undefined) return;

    const attachment = await prisma.attachment.findFirst({
      where: {
        path: relPath,
        ...(viewerHouseholdId != null ? { event: { householdId: viewerHouseholdId } } : {}),
      },
      select: { mime: true },
    });
    if (!attachment) {
      return reply.code(404).send({ error: t("fileNotFound", request.locale) });
    }

    let absPath: string;
    try {
      absPath = attachmentAbsolutePath(relPath);
    } catch {
      return reply.code(404).send({ error: t("fileNotFound", request.locale) });
    }
    try {
      await stat(absPath);
    } catch {
      return reply.code(404).send({ error: t("fileMissingOnDisk", request.locale) });
    }

    const contentType = safeContentType(attachment.mime);
    reply.header("X-Content-Type-Options", "nosniff");
    reply.type(contentType);
    return createReadStream(absPath);
  });
}

export async function attachmentRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.post(
    "/",
    {
      config: {
        rateLimit: { max: 30, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      const householdId = requireHouseholdWrite(request, reply);
      if (!householdId) return;

      const { eventId } = request.query as { eventId?: string };
      if (!eventId?.trim()) {
        return reply.code(400).send({ error: t("eventIdRequired", request.locale) });
      }

      const event = await prisma.event.findFirst({
        where: { id: eventId.trim(), ...householdWhere(householdId), deletedAt: null },
        select: { id: true, _count: { select: { attachments: true } } },
      });
      if (!event) return reply.code(404).send({ error: t("eventNotFound", request.locale) });
      if (event._count.attachments >= MAX_ATTACHMENTS_PER_EVENT) {
        return reply.code(400).send({ error: t("attachmentLimitReached", request.locale) });
      }

      const file = await request.file();
      if (!file) return reply.code(400).send({ error: t("fileRequired", request.locale) });
      if (!ALLOWED_ATTACHMENT_MIME.has(file.mimetype)) {
        return reply.code(400).send({
          error: t("unsupportedFileType", request.locale, { mimetype: file.mimetype }),
        });
      }

      const buffer = await file.toBuffer();
      let saved;
      try {
        saved = await saveEventAttachment(event.id, buffer, file.mimetype);
      } catch (err) {
        if (err instanceof InvalidAttachmentError) {
          return reply.code(400).send({ error: t("invalidImageFile", request.locale) });
        }
        throw err;
      }

      const attachment = await prisma.attachment.create({
        data: {
          eventId: event.id,
          path: saved.path,
          mime: saved.mime,
          size: saved.size,
          width: saved.width ?? undefined,
          height: saved.height ?? undefined,
        },
        select: attachmentSelect,
      });

      return reply.code(201).send(attachment);
    },
  );

  app.delete("/:id", async (request, reply) => {
    const householdId = requireHouseholdWrite(request, reply);
    if (!householdId) return;

    const { id } = request.params as { id: string };
    const attachment = await prisma.attachment.findFirst({
      where: {
        id,
        event: { householdId },
      },
      select: { id: true, path: true },
    });
    if (!attachment) {
      return reply.code(404).send({ error: t("attachmentNotFound", request.locale) });
    }

    await prisma.attachment.delete({ where: { id } });
    await removeEventAttachmentFile(attachment.path);
    return reply.code(204).send();
  });
}
