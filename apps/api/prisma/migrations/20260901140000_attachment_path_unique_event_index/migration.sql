-- Attachment.path is looked up on every file serve; eventId on every include/_count.
CREATE UNIQUE INDEX "Attachment_path_key" ON "Attachment"("path");
CREATE INDEX "Attachment_eventId_idx" ON "Attachment"("eventId");
