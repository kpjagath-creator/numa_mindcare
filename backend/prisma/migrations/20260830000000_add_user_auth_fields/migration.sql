-- Adds authentication fields to the pre-existing (previously unused) "users" table.
-- The table has never been written to by application code (confirmed by full codebase
-- audit), so this assumes it is empty. The guard below turns a non-empty table into a
-- clear, actionable migration failure instead of a generic NOT NULL constraint error,
-- so deploys fail safely rather than silently corrupting or guessing at identities.
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM "users") > 0 THEN
    RAISE EXCEPTION 'Migration aborted: "users" table is not empty (% row(s)). This migration assumes an empty bootstrap table and adds a NOT NULL UNIQUE "username" column with no default — applying it blindly would fail or require guessing usernames for existing rows. Back up the table, decide on a safe username-backfill strategy for existing rows, and rewrite this migration before retrying.', (SELECT COUNT(*) FROM "users");
  END IF;
END $$;

-- AlterTable
ALTER TABLE "users" ADD COLUMN "username" TEXT NOT NULL;
ALTER TABLE "users" ADD COLUMN "password_changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
