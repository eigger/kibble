-- 영상 백그라운드 720p 변환 상태. 사진은 NULL.
-- 기존 영상은 pending으로 두어 기동 시 잡이 건너뛰기/변환을 한 바퀴 돈다.
ALTER TABLE "Attachment" ADD COLUMN "transcodeStatus" TEXT;

CREATE INDEX "Attachment_transcodeStatus_idx" ON "Attachment"("transcodeStatus");

UPDATE "Attachment" SET "transcodeStatus" = 'pending' WHERE mime LIKE 'video/%';
