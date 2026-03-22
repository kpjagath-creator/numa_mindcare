-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "therapist_id" INTEGER;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_therapist_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "team_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
