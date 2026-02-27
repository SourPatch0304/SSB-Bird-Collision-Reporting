-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TriageStatus" AS ENUM ('NEW', 'WAITING_FOR_ANSWERS', 'COMPLETE');

-- CreateEnum
CREATE TYPE "ObservedAtSource" AS ENUM ('EXIF', 'MESSAGE_RECEIVED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('YES_NO', 'MULTICHOICE', 'FREE_TEXT');

-- CreateEnum
CREATE TYPE "ConversationFlowState" AS ENUM ('IDLE', 'ASKING', 'DONE');

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "messageBody" TEXT NOT NULL,
    "locationText" TEXT,
    "city" TEXT,
    "state" TEXT,
    "triageStatus" "TriageStatus" NOT NULL DEFAULT 'NEW',
    "llmSummary" TEXT,
    "suspectedCause" TEXT,
    "buildingCollisionLikely" BOOLEAN,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "observedAtSource" "ObservedAtSource" NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "exifCapturedAt" TIMESTAMP(3),
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "geohash" TEXT,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "twilioMediaSid" TEXT,
    "contentType" TEXT NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exifJson" JSONB,
    "exifMake" TEXT,
    "exifModel" TEXT,
    "exifLat" DOUBLE PRECISION,
    "exifLng" DOUBLE PRECISION,
    "exifCapturedAt" TIMESTAMP(3),

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "choices" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "order" INTEGER NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "valueText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationState" (
    "phoneNumber" TEXT NOT NULL,
    "currentReportId" TEXT NOT NULL,
    "currentQuestionOrder" INTEGER NOT NULL DEFAULT 0,
    "state" "ConversationFlowState" NOT NULL DEFAULT 'IDLE',
    "lastInboundAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationState_pkey" PRIMARY KEY ("phoneNumber")
);

-- CreateIndex
CREATE INDEX "Report_phoneNumber_createdAt_idx" ON "Report"("phoneNumber", "createdAt");

-- CreateIndex
CREATE INDEX "Report_triageStatus_idx" ON "Report"("triageStatus");

-- CreateIndex
CREATE INDEX "Media_reportId_idx" ON "Media"("reportId");

-- CreateIndex
CREATE INDEX "Question_reportId_order_idx" ON "Question"("reportId", "order");

-- CreateIndex
CREATE INDEX "Answer_reportId_idx" ON "Answer"("reportId");

-- CreateIndex
CREATE INDEX "Answer_questionId_idx" ON "Answer"("questionId");

-- CreateIndex
CREATE INDEX "ConversationState_currentReportId_idx" ON "ConversationState"("currentReportId");

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationState" ADD CONSTRAINT "ConversationState_currentReportId_fkey" FOREIGN KEY ("currentReportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

