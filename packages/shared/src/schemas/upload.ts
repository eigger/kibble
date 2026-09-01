import { z } from "zod";

/** 클라이언트·서버가 같은 청크 크기로 진행률·재시도를 맞춘다 (drop 이식). */
export const UPLOAD_CHUNK_SIZE_BYTES = 8 * 1024 * 1024; // 8MB

export const attachmentUploadInitSchema = z.object({
  eventId: z.string().min(1),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  totalSize: z.number().int().positive(),
});

export type AttachmentUploadInitInput = z.infer<typeof attachmentUploadInitSchema>;
