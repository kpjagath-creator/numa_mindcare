// Operational script: remove all dummy OPERATIONAL data, preserving auth and schema.
//
// Purpose
// -------
// Gives the clinic a clean production baseline before real use. It deletes patients, sessions,
// notes, assignments, status logs, therapists and their availability/blockouts. It does NOT touch
// `users`, `_prisma_migrations`, the schema, or any configuration.
//
// !! THIS IS DESTRUCTIVE AND HAS NO UNDO ONCE COMMITTED. Take a database snapshot first. !!
//
// Safety design (all four must line up before anything is committed):
//   1. DRY RUN BY DEFAULT — without `--execute` the whole thing runs inside a transaction that is
//      always rolled back. You see exactly what would be deleted, and nothing changes.
//   2. DATABASE NAME CONFIRMATION — you must pass `--confirm-database=<name>` matching the
//      database in DATABASE_URL. Makes pointing it at the wrong database a deliberate act.
//   3. NON-EMPTY `users` GUARD — refuses to run if the users table is empty, which would mean the
//      connection is not the database you think it is (or auth is already broken).
//   4. REFERENTIAL INTEGRITY CHECK — orphan scan runs inside the transaction *before* commit; any
//      orphan aborts and rolls back.
//
// Credentials are never written here or logged — DATABASE_URL comes from the environment and only
// its host/database are printed.
//
// Usage
// -----
//   Dry run (safe, always rolls back):
//     DATABASE_URL="<url>" npm run cleanup-dummy-data -- --confirm-database=postgres
//
//   Commit for real (after reviewing the dry run and taking a snapshot):
//     DATABASE_URL="<url>" npm run cleanup-dummy-data -- --confirm-database=postgres --execute
//
// Removing the dataset this script's companion (`seedTestDataset.ts`) creates: re-run this script.
// It removes ALL operational data, dummy or not — there is no dummy-only filter, by design.

import "../env";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: ["warn", "error"] });

// Sentinel used to force a rollback out of an interactive transaction on a dry run.
const DRY_RUN_ROLLBACK = "__DRY_RUN_ROLLBACK__";

interface Counts {
  patients: number;
  patient_status_logs: number;
  patient_assignments: number;
  therapy_sessions: number;
  clinical_notes: number;
  clinical_note_amendments: number;
  therapist_availability: number;
  therapist_blockouts: number;
  team_members: number;
  users: number;
}

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

async function countAll(tx: Tx): Promise<Counts> {
  const [
    patients, patient_status_logs, patient_assignments, therapy_sessions,
    clinical_notes, clinical_note_amendments, therapist_availability,
    therapist_blockouts, team_members, users,
  ] = await Promise.all([
    tx.patient.count(), tx.patientStatusLog.count(), tx.patientAssignment.count(),
    tx.therapySession.count(), tx.clinicalNote.count(), tx.clinicalNoteAmendment.count(),
    tx.therapistAvailability.count(), tx.therapistBlockout.count(),
    tx.teamMember.count(), tx.user.count(),
  ]);
  return {
    patients, patient_status_logs, patient_assignments, therapy_sessions,
    clinical_notes, clinical_note_amendments, therapist_availability,
    therapist_blockouts, team_members, users,
  };
}

function printCounts(label: string, c: Counts): void {
  console.log(`\n  ${label}`);
  console.log("  " + "-".repeat(52));
  for (const [table, n] of Object.entries(c)) {
    const preserved = table === "users" ? "   <- PRESERVED" : "";
    console.log(`  ${table.padEnd(28)} ${String(n).padStart(8)}${preserved}`);
  }
}

/** Orphan scan. Every count must be zero or the transaction is aborted. */
async function checkIntegrity(tx: Tx): Promise<{ label: string; count: number }[]> {
  const rows = await tx.$queryRawUnsafe<{ label: string; count: bigint }[]>(`
    SELECT 'sessions without a patient'        AS label, count(*) FROM therapy_sessions s
      LEFT JOIN patients p ON p.id = s.patient_id WHERE p.id IS NULL
    UNION ALL SELECT 'sessions without a therapist', count(*) FROM therapy_sessions s
      LEFT JOIN team_members t ON t.id = s.team_member_id WHERE t.id IS NULL
    UNION ALL SELECT 'notes without a session', count(*) FROM clinical_notes n
      LEFT JOIN therapy_sessions s ON s.id = n.session_id WHERE s.id IS NULL
    UNION ALL SELECT 'amendments without a note', count(*) FROM clinical_note_amendments a
      LEFT JOIN clinical_notes n ON n.id = a.clinical_note_id WHERE n.id IS NULL
    UNION ALL SELECT 'status logs without a patient', count(*) FROM patient_status_logs l
      LEFT JOIN patients p ON p.id = l.patient_id WHERE p.id IS NULL
    UNION ALL SELECT 'assignments without a patient', count(*) FROM patient_assignments a
      LEFT JOIN patients p ON p.id = a.patient_id WHERE p.id IS NULL
    UNION ALL SELECT 'availability without a therapist', count(*) FROM therapist_availability v
      LEFT JOIN team_members t ON t.id = v.team_member_id WHERE t.id IS NULL
    UNION ALL SELECT 'blockouts without a therapist', count(*) FROM therapist_blockouts b
      LEFT JOIN team_members t ON t.id = b.team_member_id WHERE t.id IS NULL
    UNION ALL SELECT 'users pointing at a missing therapist', count(*) FROM users u
      LEFT JOIN team_members t ON t.id = u.team_member_id
      WHERE u.team_member_id IS NOT NULL AND t.id IS NULL
  `);
  return rows.map((r) => ({ label: r.label, count: Number(r.count) }));
}

function parseTarget(url: string): { host: string; database: string } {
  // URL parsing only — the password is never read out of the parsed object.
  const u = new URL(url);
  return { host: `${u.hostname}:${u.port || "5432"}`, database: u.pathname.replace(/^\//, "") };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  const allowNoUsers = args.includes("--allow-no-users");
  const confirmArg = args.find((a) => a.startsWith("--confirm-database="));
  const confirmedDatabase = confirmArg?.split("=")[1];

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Pass it in the environment; never hard-code it.");
    process.exit(1);
  }

  const target = parseTarget(url);
  console.log("\n" + "=".repeat(58));
  console.log("  Numa MindCare — dummy operational data cleanup");
  console.log("=".repeat(58));
  console.log(`  Target host : ${target.host}`);
  console.log(`  Database    : ${target.database}`);
  console.log(`  Mode        : ${execute ? "EXECUTE (will COMMIT)" : "DRY RUN (will ROLL BACK)"}`);

  // Safeguard 2 — the operator must name the database they intend to modify.
  if (confirmedDatabase !== target.database) {
    console.error(
      `\n  REFUSING TO RUN.\n` +
        `  Pass --confirm-database=<name> matching the database in DATABASE_URL.\n` +
        `  Expected: --confirm-database=${target.database}\n` +
        `  Got:      ${confirmedDatabase ? `--confirm-database=${confirmedDatabase}` : "(missing)"}\n`
    );
    process.exit(1);
  }

  let committed = false;
  try {
    await prisma.$transaction(
      async (tx) => {
        const before = await countAll(tx);
        printCounts("BEFORE", before);

        // Safeguard 3 — an empty users table means this is not the database you think it is.
        if (before.users === 0 && !allowNoUsers) {
          throw new Error(
            "REFUSING TO RUN: the `users` table is empty. That usually means DATABASE_URL points " +
              "at the wrong database. Pass --allow-no-users only if you are certain."
          );
        }

        // Clear the dangling reference first: users.team_member_id has NO foreign key (verified
        // across every migration), so deleting team members would silently orphan it.
        const clearedUsers = await tx.user.updateMany({
          where: { teamMemberId: { not: null } },
          data: { teamMemberId: null },
        });

        // Explicit blockout delete before team_members so the intent is visible in the output;
        // the team_members delete would cascade it anyway.
        const blockouts = await tx.therapistBlockout.deleteMany({});

        // Cascades: patients -> status logs, assignments, sessions -> notes -> amendments.
        const patients = await tx.patient.deleteMany({});

        // Cascades: team_members -> availability (and blockouts, already emptied above).
        const teamMembers = await tx.teamMember.deleteMany({});

        console.log("\n  OPERATIONS");
        console.log("  " + "-".repeat(52));
        console.log(`  users.team_member_id cleared  ${String(clearedUsers.count).padStart(8)}`);
        console.log(`  therapist_blockouts deleted   ${String(blockouts.count).padStart(8)}`);
        console.log(`  patients deleted (cascading)  ${String(patients.count).padStart(8)}`);
        console.log(`  team_members deleted (casc.)  ${String(teamMembers.count).padStart(8)}`);

        const after = await countAll(tx);
        printCounts("AFTER", after);

        // Safeguard 4 — integrity is verified before the commit decision, not after.
        const integrity = await checkIntegrity(tx);
        console.log("\n  REFERENTIAL INTEGRITY");
        console.log("  " + "-".repeat(52));
        for (const row of integrity) {
          console.log(`  ${row.label.padEnd(40)} ${String(row.count).padStart(6)}`);
        }
        const bad = integrity.filter((r) => r.count > 0);
        if (bad.length > 0) {
          throw new Error(
            `Aborting — orphaned records detected: ${bad.map((b) => b.label).join(", ")}`
          );
        }

        if (after.users !== before.users) {
          throw new Error(`Aborting — user count changed (${before.users} -> ${after.users}). Auth must be preserved.`);
        }

        if (!execute) throw new Error(DRY_RUN_ROLLBACK);
        committed = true;
      },
      { timeout: 120_000 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === DRY_RUN_ROLLBACK) {
      console.log("\n  " + "=".repeat(52));
      console.log("  DRY RUN COMPLETE — transaction rolled back, nothing changed.");
      console.log("  Re-run with --execute to commit.");
      console.log("  " + "=".repeat(52) + "\n");
      await prisma.$disconnect();
      return;
    }
    console.error(`\n  FAILED (rolled back): ${message}\n`);
    await prisma.$disconnect();
    process.exit(1);
  }

  if (committed) {
    console.log("\n  " + "=".repeat(52));
    console.log("  CLEANUP COMMITTED.");
    console.log("  " + "=".repeat(52) + "\n");
  }
  await prisma.$disconnect();
}

void main();
