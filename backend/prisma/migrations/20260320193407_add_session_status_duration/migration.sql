-- AlterTable
ALTER TABLE "therapy_sessions" ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "duration_mins" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'upcoming';
