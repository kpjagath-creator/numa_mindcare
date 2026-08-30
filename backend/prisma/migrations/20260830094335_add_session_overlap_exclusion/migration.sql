-- Capability 1 (SCH-05): concurrency-safe session booking.
--
-- The application-level overlap check in therapySessionsService.ts (findFirst inside a
-- $transaction) is a classic check-then-act race under Postgres's default READ COMMITTED
-- isolation: two concurrent transactions can both read "no conflict" before either commits,
-- producing a double-booking. This migration adds the actual invariant at the database level
-- so it holds regardless of application-level races, using a partial EXCLUDE constraint (the
-- direction already flagged as the recommended fix in ARCHITECTURE.md §11).
--
-- btree_gist is required so a plain scalar column (patient_id / team_member_id) can be combined
-- with a range type (tsrange) in the same GiST index used by EXCLUDE.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- A patient cannot have two overlapping sessions, excluding cancelled/rescheduled/no_show
-- sessions from the invariant (same statuses therapySessionsService.ts's CONFLICT_EXCLUDED_STATUSES
-- already excludes at the application level).
ALTER TABLE "therapy_sessions"
  ADD CONSTRAINT "therapy_sessions_patient_no_overlap"
  EXCLUDE USING gist (
    "patient_id" WITH =,
    tsrange("start_time", "end_time") WITH &&
  )
  WHERE (status NOT IN ('cancelled', 'rescheduled', 'no_show'));

-- A therapist cannot have two overlapping sessions, same exclusions.
ALTER TABLE "therapy_sessions"
  ADD CONSTRAINT "therapy_sessions_therapist_no_overlap"
  EXCLUDE USING gist (
    "team_member_id" WITH =,
    tsrange("start_time", "end_time") WITH &&
  )
  WHERE (status NOT IN ('cancelled', 'rescheduled', 'no_show'));
