-- 영상 첨부의 대표 프레임 경로. 기존 행은 NULL로 남고, 클라이언트는 그때 <video>로 되돌아간다.
ALTER TABLE "Attachment" ADD COLUMN "posterPath" TEXT;

-- 미디어 서빙이 path 또는 posterPath로 첨부 행을 찾는다.
CREATE INDEX "Attachment_posterPath_idx" ON "Attachment"("posterPath");
