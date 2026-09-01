// Operational script: create a small, realistic, clearly-fictional test dataset.
//
// Purpose
// -------
// Leaves the application in a clean but *testable* state after `cleanupDummyData.ts`. Everything
// is created through the real service layer — `patientsService`, `teamMembersService`,
// `availabilityService`, `therapySessionsService`, `clinicalNotesService` — so identifier
// generation, Zod-equivalent input shapes, availability validation, the booking EXCLUDE
// constraints, patient-lifecycle auto-advance and clinical-note sign-off all actually run. Nothing
// is inserted straight into the database.
//
// !! RUN ONLY AFTER TZ-01 IS DEPLOYED. !! Before that commit, session times are parsed in the
// server's timezone, so every session this script creates on a UTC host would be stored 5h30m
// late — recreating the corruption the cleanup just removed. The script refuses to run if the
// deployed code lacks the clinic-time boundary (see the guard in `main`).
//
// Usage
// -----
//   Preview what would be created (no writes):
//     DATABASE_URL="<url>" npm run seed-test-dataset -- --confirm-database=postgres
//
//   Create it:
//     DATABASE_URL="<url>" npm run seed-test-dataset -- --confirm-database=postgres --execute
//
// To remove this dataset later: re-run `npm run cleanup-dummy-data` (it clears ALL operational
// data). Every record below is recognisably fictional — @numa-test.example emails, "TEST-" note
// prefixes — but the cleanup script deliberately has no dummy-only filter.
//
// A note on `completeSession` (repository behaviour, not a workaround): it sets
// `endTime = now` for a session that has already started, and `endTime = startTime` for one that
// has not. Two completed sessions for the same therapist (or the same patient) therefore both run
// to "now" and their tsranges overlap, which the booking EXCLUDE constraints reject. The dataset
// below is shaped around that: at most one already-started completion per therapist and per
// patient.

import "../env";
import prisma from "../lib/prisma";
import { clinicWallClockToUtc, clinicParts, CLINIC_TIME_ZONE } from "../lib/clinicTime";
import * as teamMembersService from "../services/teamMembersService";
import * as patientsService from "../services/patientsService";
import * as availabilityService from "../services/availabilityService";
import * as sessionsService from "../services/therapySessionsService";
import * as notesService from "../services/clinicalNotesService";

// ── The one session with a hard-coded, manually verifiable clinic time ─────────
// 15 Sept 2026, 10:00 Asia/Kolkata must be stored as 2026-09-15T04:30:00.000Z.
const TZ_PROBE_DATE = "2026-09-15";
const TZ_PROBE_TIME = "10:00";
const TZ_PROBE_EXPECTED_UTC = "2026-09-15T04:30:00.000Z";

const SEEDED_BY = "Test Seeder";

function parseTarget(url: string): { host: string; database: string } {
  const u = new URL(url);
  return { host: `${u.hostname}:${u.port || "5432"}`, database: u.pathname.replace(/^\//, "") };
}

/**
 * A future clinic date at least `minDaysAhead` out, skipping Sundays — the therapists seeded
 * below work Mon-Sat, and `assertTherapistAvailable` (correctly) rejects a booking on a day with
 * no configured window.
 */
function upcomingClinicDate(minDaysAhead: number): string {
  for (let offset = minDaysAhead; offset < minDaysAhead + 7; offset++) {
    const p = clinicParts(new Date(Date.now() + offset * 24 * 60 * 60 * 1000));
    if (p.dayOfWeek === 0) continue; // Sunday — no availability
    return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  }
  throw new Error("Could not find a non-Sunday date — this should be unreachable.");
}

/**
 * The most recent clinic working day (today, or yesterday if today is a Sunday). Used for the
 * already-started sessions that get completed, so `completeSession` produces a realistic
 * [start, now] window rather than a zero-length one.
 */
function recentClinicWorkday(): string {
  for (let offset = 0; offset > -7; offset--) {
    const p = clinicParts(new Date(Date.now() + offset * 24 * 60 * 60 * 1000));
    if (p.dayOfWeek === 0) continue; // Sunday — therapists have no window
    return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  }
  throw new Error("Could not find a recent non-Sunday date — this should be unreachable.");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  const confirmArg = args.find((a) => a.startsWith("--confirm-database="));
  const confirmed = confirmArg?.split("=")[1];

  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL is not set."); process.exit(1); }
  const target = parseTarget(url);

  console.log("\n" + "=".repeat(58));
  console.log("  Numa MindCare — realistic test dataset");
  console.log("=".repeat(58));
  console.log(`  Target host   : ${target.host}`);
  console.log(`  Database      : ${target.database}`);
  console.log(`  Clinic zone   : ${CLINIC_TIME_ZONE}`);
  console.log(`  Mode          : ${execute ? "EXECUTE (writes)" : "PREVIEW (no writes)"}`);

  if (confirmed !== target.database) {
    console.error(
      `\n  REFUSING TO RUN.\n  Expected --confirm-database=${target.database}\n` +
        `  Got:      ${confirmed ? `--confirm-database=${confirmed}` : "(missing)"}\n`
    );
    process.exit(1);
  }

  // Guard: refuse to seed on a build where the timezone boundary is missing or wrong. This is the
  // difference between a correct dataset and silently recreating the +5h30m corruption.
  const probe = clinicWallClockToUtc(TZ_PROBE_DATE, TZ_PROBE_TIME);
  if (probe.toISOString() !== TZ_PROBE_EXPECTED_UTC) {
    console.error(
      `\n  REFUSING TO RUN: clinic-time conversion is wrong.\n` +
        `  ${TZ_PROBE_DATE} ${TZ_PROBE_TIME} ${CLINIC_TIME_ZONE}\n` +
        `    expected ${TZ_PROBE_EXPECTED_UTC}\n    got      ${probe.toISOString()}\n` +
        `  Deploy TZ-01 before seeding.\n`
    );
    process.exit(1);
  }
  console.log(`  TZ self-check : ${TZ_PROBE_DATE} ${TZ_PROBE_TIME} -> ${probe.toISOString()}  OK`);

  const existing = await prisma.therapySession.count();
  const existingPatients = await prisma.patient.count();
  if (existing > 0 || existingPatients > 0) {
    console.error(
      `\n  REFUSING TO RUN: the database already has ${existingPatients} patient(s) and ` +
        `${existing} session(s).\n  Run the cleanup first, or seed only into an empty baseline.\n`
    );
    process.exit(1);
  }

  if (!execute) {
    console.log("\n  PREVIEW — the following would be created:\n");
    console.log("  Therapists (3)   Dr. Ananya Rao, Dr. Vikram Sethi, Dr. Leela Fernandes");
    console.log("  Availability     Mon-Sat working windows for each");
    console.log("  Patients (5)     Meera Krishnan, Arjun Nair, Priya Menon, Rohan Das, Kavya Iyer");
    console.log("  Sessions (8)     upcoming / completed / cancelled / rescheduled / no-show");
    console.log("  Clinical notes   1 signed + amendment, 1 draft");
    console.log("  Payments         paid, partial, unpaid, plus a no-show fee");
    console.log(`\n  Includes the timezone probe session: ${TZ_PROBE_DATE} ${TZ_PROBE_TIME} clinic time.`);
    console.log("\n  Re-run with --execute to create it.\n");
    await prisma.$disconnect();
    return;
  }

  const log = (msg: string) => console.log(`  ${msg}`);
  console.log("\n  CREATING\n  " + "-".repeat(52));

  // ── Team ────────────────────────────────────────────────────────────────────
  const ananya = await teamMembersService.createTeamMember({
    name: "Dr. Ananya Rao", employee_type: "psychologist", email: "ananya.rao@numa-test.example",
  });
  const vikram = await teamMembersService.createTeamMember({
    name: "Dr. Vikram Sethi", employee_type: "psychiatrist", email: "vikram.sethi@numa-test.example",
  });
  const leela = await teamMembersService.createTeamMember({
    name: "Dr. Leela Fernandes", employee_type: "psychologist", email: "leela.fernandes@numa-test.example",
  });
  log(`therapists: ${ananya.employeeCode} ${ananya.name} | ${vikram.employeeCode} ${vikram.name} | ${leela.employeeCode} ${leela.name}`);

  // Availability — Monday(1) to Saturday(6), wide enough to schedule freely.
  const weekdays = [1, 2, 3, 4, 5, 6];
  await availabilityService.setAvailability(ananya.id, {
    slots: weekdays.map((d) => ({ day_of_week: d, start_time: "09:00", end_time: "18:00" })),
  });
  await availabilityService.setAvailability(vikram.id, {
    slots: weekdays.map((d) => ({ day_of_week: d, start_time: "10:00", end_time: "17:00" })),
  });
  await availabilityService.setAvailability(leela.id, {
    slots: weekdays.map((d) => ({ day_of_week: d, start_time: "09:00", end_time: "18:00" })),
  });
  log("availability: Mon-Sat windows set for all three therapists");

  // ── Patients ────────────────────────────────────────────────────────────────
  const meera = await patientsService.createPatient({
    name: "Meera Krishnan", mobile: "9800000001", email: "meera.krishnan@numa-test.example",
    age: 29, source: "Website", therapist_id: ananya.id,
  });
  const arjun = await patientsService.createPatient({
    name: "Arjun Nair", mobile: "9800000002", email: "arjun.nair@numa-test.example",
    age: 34, source: "Referral", referred_by: "Dr. S. Pillai", therapist_id: ananya.id,
  });
  const priya = await patientsService.createPatient({
    name: "Priya Menon", mobile: "9800000003", email: "priya.menon@numa-test.example",
    age: 41, source: "Website", therapist_id: vikram.id,
  });
  const rohan = await patientsService.createPatient({
    name: "Rohan Das", mobile: "9800000004", email: "rohan.das@numa-test.example",
    age: 26, source: "Walk-in", therapist_id: leela.id,
  });
  const kavya = await patientsService.createPatient({
    name: "Kavya Iyer", mobile: "9800000005", email: "kavya.iyer@numa-test.example",
    age: 37, source: "Referral", referred_by: "Dr. N. Menon", therapist_id: ananya.id,
  });
  log(`patients: ${[meera, arjun, priya, rohan, kavya].map((p) => `${p.patientNumber} ${p.name}`).join(" | ")}`);

  const today = recentClinicWorkday();
  const inThreeDays = upcomingClinicDate(3);
  const inFiveDays = upcomingClinicDate(5);
  const inSevenDays = upcomingClinicDate(7);

  // ── Meera: newly registered, no sessions (status `created`) ──────────────────
  log(`${meera.name}: newly registered, no sessions (created)`);

  // ── Arjun: upcoming discovery call (status -> discovery_scheduled) ───────────
  await sessionsService.createSession({
    patient_id: arjun.id, therapist_id: ananya.id, session_date: inThreeDays,
    start_time: "11:00", duration_mins: 30, session_type: "discovery",
    notes: "TEST-DATA: initial intake call.",
  });
  log(`${arjun.name}: upcoming discovery call on ${inThreeDays} 11:00 (discovery_scheduled)`);

  // ── Priya: discovery completed today -> started_therapy, plus the TZ probe ───
  // Started earlier today, so completing it produces a realistic [start, now] window.
  const priyaDiscovery = await sessionsService.createSession({
    patient_id: priya.id, therapist_id: vikram.id, session_date: today,
    start_time: "10:30", duration_mins: 30, session_type: "discovery",
  });
  await sessionsService.completeSession(priyaDiscovery.id, {
    notes: "TEST-DATA: intake completed; agreed on weekly sessions.",
  });

  // THE TIMEZONE PROBE — a fixed clinic wall-clock time whose stored instant is manually checkable.
  const tzProbe = await sessionsService.createSession({
    patient_id: priya.id, therapist_id: vikram.id, session_date: TZ_PROBE_DATE,
    start_time: TZ_PROBE_TIME, duration_mins: 60, session_type: "therapy",
    notes: "TEST-DATA: timezone verification session — 10:00 clinic time.",
  });
  log(`${priya.name}: discovery completed today (started_therapy); TZ probe session #${tzProbe.id}`);

  // A cancelled session — cancelled/rescheduled/no_show are excluded from the overlap constraint.
  const priyaCancelled = await sessionsService.createSession({
    patient_id: priya.id, therapist_id: vikram.id, session_date: inFiveDays,
    start_time: "11:00", duration_mins: 60, session_type: "therapy",
  });
  await sessionsService.cancelSession(priyaCancelled.id, { reason: "TEST-DATA: patient travelling." });
  log(`${priya.name}: one cancelled therapy session on ${inFiveDays}`);

  // ── Rohan: discovery completed today (different therapist) + rescheduled pair ─
  const rohanDiscovery = await sessionsService.createSession({
    patient_id: rohan.id, therapist_id: leela.id, session_date: today,
    start_time: "09:30", duration_mins: 30, session_type: "discovery",
  });
  await sessionsService.completeSession(rohanDiscovery.id, {
    notes: "TEST-DATA: intake completed; low mood, sleep disruption.",
  });

  const rohanOriginal = await sessionsService.createSession({
    patient_id: rohan.id, therapist_id: leela.id, session_date: inFiveDays,
    start_time: "14:00", duration_mins: 60, session_type: "therapy",
  });
  const rohanRescheduled = await sessionsService.rescheduleSession(rohanOriginal.id, {
    session_date: inSevenDays, start_time: "15:00", duration_mins: 60,
    notes: "TEST-DATA: moved at patient request.",
  });
  log(`${rohan.name}: discovery completed today; session #${rohanOriginal.id} rescheduled -> #${rohanRescheduled.id} on ${inSevenDays}`);

  // ── Kavya: discovery completed today (third therapist) + a no-show ───────────
  const kavyaDiscovery = await sessionsService.createSession({
    patient_id: kavya.id, therapist_id: ananya.id, session_date: today,
    start_time: "09:15", duration_mins: 30, session_type: "discovery",
  });
  await sessionsService.completeSession(kavyaDiscovery.id, {
    notes: "TEST-DATA: intake completed; anxiety management goals set.",
  });

  const kavyaNoShow = await sessionsService.createSession({
    patient_id: kavya.id, therapist_id: ananya.id, session_date: inThreeDays,
    start_time: "15:00", duration_mins: 60, session_type: "therapy",
  });
  await sessionsService.markNoShow(kavyaNoShow.id, { no_show_fee: 500 });
  log(`${kavya.name}: discovery completed today; one no-show with a ₹500 fee`);

  // ── Clinical notes on a completed session (sign-off + append-only amendment) ─
  const signed = await notesService.createNote(priyaDiscovery.id, {
    content: "TEST-DATA: Presented with work-related stress. Agreed weekly CBT sessions.",
    created_by_name: SEEDED_BY,
  });
  await notesService.signNote(signed.id, { signed_by_name: SEEDED_BY });
  await notesService.addAmendment(signed.id, {
    content: "TEST-DATA: Amendment — patient later confirmed disturbed sleep for ~6 weeks.",
    created_by_name: SEEDED_BY,
  });
  await notesService.createNote(rohanDiscovery.id, {
    content: "TEST-DATA: Draft note pending review.",
    created_by_name: SEEDED_BY,
  });
  log("clinical notes: 1 signed (+1 amendment) on Priya's discovery, 1 draft on Rohan's");

  // ── Payments — only states the implementation actually supports ──────────────
  await sessionsService.updatePaymentStatus(priyaDiscovery.id, {
    payment_status: "paid", changed_by_name: SEEDED_BY,
  });
  await sessionsService.updatePaymentStatus(rohanDiscovery.id, {
    payment_status: "partial", changed_by_name: SEEDED_BY,
  });
  await sessionsService.updatePaymentStatus(kavyaNoShow.id, {
    payment_status: "unpaid", changed_by_name: SEEDED_BY,
  });
  log("payments: paid / partial / unpaid across three sessions");

  // ── Verification ────────────────────────────────────────────────────────────
  const stored = await prisma.therapySession.findUnique({ where: { id: tzProbe.id } });
  const storedIso = stored!.startTime.toISOString();
  const tzOk = storedIso === TZ_PROBE_EXPECTED_UTC;

  console.log("\n  TIMEZONE VERIFICATION");
  console.log("  " + "-".repeat(52));
  console.log(`  session #${tzProbe.id}: ${TZ_PROBE_DATE} ${TZ_PROBE_TIME} ${CLINIC_TIME_ZONE}`);
  console.log(`  expected stored : ${TZ_PROBE_EXPECTED_UTC}`);
  console.log(`  actual stored   : ${storedIso}   ${tzOk ? "OK" : "MISMATCH"}`);

  const summary = {
    team_members: await prisma.teamMember.count(),
    therapist_availability: await prisma.therapistAvailability.count(),
    patients: await prisma.patient.count(),
    therapy_sessions: await prisma.therapySession.count(),
    clinical_notes: await prisma.clinicalNote.count(),
    clinical_note_amendments: await prisma.clinicalNoteAmendment.count(),
    patient_status_logs: await prisma.patientStatusLog.count(),
  };
  console.log("\n  DATASET SUMMARY");
  console.log("  " + "-".repeat(52));
  for (const [k, v] of Object.entries(summary)) console.log(`  ${k.padEnd(28)} ${String(v).padStart(6)}`);

  const statuses = await prisma.therapySession.groupBy({ by: ["status"], _count: { _all: true } });
  console.log("\n  SESSION STATUSES");
  console.log("  " + "-".repeat(52));
  for (const s of statuses) console.log(`  ${s.status.padEnd(28)} ${String(s._count._all).padStart(6)}`);

  const lifecycle = await prisma.patient.groupBy({ by: ["currentStatus"], _count: { _all: true } });
  console.log("\n  PATIENT LIFECYCLE STATES");
  console.log("  " + "-".repeat(52));
  for (const p of lifecycle) console.log(`  ${p.currentStatus.padEnd(28)} ${String(p._count._all).padStart(6)}`);

  console.log(`\n  ${tzOk ? "DATASET CREATED." : "DATASET CREATED, BUT TIMEZONE CHECK FAILED — investigate."}\n`);
  await prisma.$disconnect();
  if (!tzOk) process.exit(1);
}

void main();
