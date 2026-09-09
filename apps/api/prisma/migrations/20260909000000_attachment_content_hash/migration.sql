-- 저장된 바이트의 sha256. 같은 파일이 다시 올라오면 새로 쓰지 않고 하드링크로 잇는다.
-- 이 컬럼 이전 첨부는 NULL이라 중복 제거 대상이 아니다 — 소급 해시는 하지 않는다 (K-12).
ALTER TABLE "Attachment" ADD COLUMN "contentHash" TEXT;

CREATE INDEX "Attachment_contentHash_idx" ON "Attachment"("contentHash");

-- 변환 시도 횟수. 잡을 집는 순간 올린다 — ffmpeg가 컨테이너를 OOM으로 죽이면
-- 실패 처리 코드가 아예 안 돌기 때문에, 실패한 뒤에 세면 영원히 0에 머문다.
ALTER TABLE "Attachment" ADD COLUMN "transcodeAttempts" INTEGER NOT NULL DEFAULT 0;

-- 이미 failed로 끝난 행은 한 번 더 기회를 준다. 재시도 상한은 코드가 센다.
UPDATE "Attachment" SET "transcodeAttempts" = 1 WHERE "transcodeStatus" = 'failed';
