-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'ko',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationPushSent" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "doseSlotIndex" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicationPushSent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MedicationPushSent_courseId_doseSlotIndex_kind_dayKey_key" ON "MedicationPushSent"("courseId", "doseSlotIndex", "kind", "dayKey");

-- CreateIndex
CREATE INDEX "MedicationPushSent_dayKey_idx" ON "MedicationPushSent"("dayKey");

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationPushSent" ADD CONSTRAINT "MedicationPushSent_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "MedicationCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
