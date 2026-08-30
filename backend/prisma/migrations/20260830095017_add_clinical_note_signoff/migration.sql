-- AlterTable
ALTER TABLE "clinical_notes" ADD COLUMN     "signed_at" TIMESTAMP(3),
ADD COLUMN     "signed_by_name" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'draft';

-- CreateTable
CREATE TABLE "clinical_note_amendments" (
    "id" SERIAL NOT NULL,
    "clinical_note_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "created_by_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_note_amendments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "clinical_note_amendments" ADD CONSTRAINT "clinical_note_amendments_clinical_note_id_fkey" FOREIGN KEY ("clinical_note_id") REFERENCES "clinical_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
