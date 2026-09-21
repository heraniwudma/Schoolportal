-- Migration: Add exam draft persistence improvements and rejected exam review history
-- 1. Add columns to Examination
ALTER TABLE "Examination" ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;
ALTER TABLE "Examination" ADD COLUMN IF NOT EXISTS "isResubmitted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Examination" ADD COLUMN IF NOT EXISTS "resubmittedAt" TIMESTAMP(3);

-- 2. Add marks column to Question
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "marks" DOUBLE PRECISION NOT NULL DEFAULT 10;

-- 3. Create exam_review_history table
CREATE TABLE IF NOT EXISTS "exam_review_history" (
  "id" TEXT NOT NULL,
  "examId" TEXT NOT NULL,
  "status" "ExamStatus" NOT NULL,
  "action" TEXT NOT NULL,
  "reason" TEXT,
  "actionById" TEXT,
  "actionByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "exam_review_history_pkey" PRIMARY KEY ("id")
);

-- 4. Foreign Keys
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_review_history_examId_fkey') THEN
    ALTER TABLE "exam_review_history" ADD CONSTRAINT "exam_review_history_examId_fkey"
      FOREIGN KEY ("examId") REFERENCES "Examination"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS "exam_review_history_examId_idx" ON "exam_review_history"("examId");

-- 6. Backfill legacy rejection reason from instructions if present
UPDATE "Examination"
SET "rejectionReason" = TRIM(SUBSTRING("instructions" FROM '\[REJECTION_REASON\]:\s*(.*)'))
WHERE "status" = 'REJECTED' 
  AND ("rejectionReason" IS NULL OR "rejectionReason" = '')
  AND "instructions" LIKE '[REJECTION_REASON]:%';
