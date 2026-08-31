-- AlterTable
-- Nullable: existing therapist records predate the Google Calendar integration and have no
-- email. New onboarding requires one at the validator layer; the column stays nullable so this
-- migration cannot fail on existing rows and so those rows remain editable and bookable.
ALTER TABLE "team_members" ADD COLUMN     "email" TEXT;

-- AlterTable
-- Google Calendar / Meet integration state for the external event representing this session.
-- All nullable: sessions created before this feature legitimately have no meeting.
ALTER TABLE "therapy_sessions" ADD COLUMN     "google_event_id" TEXT,
ADD COLUMN     "meeting_error" TEXT,
ADD COLUMN     "meeting_link" TEXT,
ADD COLUMN     "meeting_provider" TEXT,
ADD COLUMN     "meeting_status" TEXT;

-- CreateIndex
-- Backstop against recording a duplicate external Google Calendar event against two sessions.
CREATE UNIQUE INDEX "therapy_sessions_google_event_id_key" ON "therapy_sessions"("google_event_id");
