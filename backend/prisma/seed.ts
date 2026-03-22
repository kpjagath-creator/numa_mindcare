// Seed script — populates DB with 10 team members, 10 patients, and ~25 sessions
// Run with: npx ts-node prisma/seed.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ── Helpers ────────────────────────────────────────────────────────────────

function dt(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}:00`);
}

function addMins(d: Date, mins: number): Date {
  return new Date(d.getTime() + mins * 60 * 1000);
}

// Generate employee codes matching the existing format
async function genEmployeeCode(type: string, tx: typeof prisma): Promise<string> {
  const prefix = type === "psychologist" ? "PSY" : "PST";
  const count = await tx.teamMember.count({ where: { employeeType: type } });
  return `${prefix}${String(count + 1).padStart(3, "0")}`;
}

// Generate patient number (1001-based)
async function genPatientNumber(tx: typeof prisma): Promise<string> {
  const count = await tx.patient.count();
  return String(count + 1001);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Seeding database…\n");

  // ── 1. Team Members ────────────────────────────────────────────────────

  const teamData = [
    { name: "Dr. Anjali Mehta",      employeeType: "psychologist" },
    { name: "Dr. Rohan Verma",       employeeType: "psychiatrist" },
    { name: "Dr. Priya Nair",        employeeType: "psychologist" },
    { name: "Dr. Karan Sharma",      employeeType: "psychiatrist" },
    { name: "Dr. Sneha Iyer",        employeeType: "psychologist" },
    { name: "Dr. Arun Pillai",       employeeType: "psychiatrist" },
    { name: "Dr. Meera Joshi",       employeeType: "psychologist" },
    { name: "Dr. Vikram Bhat",       employeeType: "psychologist" },
    { name: "Dr. Divya Krishnan",    employeeType: "psychiatrist" },
    { name: "Dr. Rahul Gupta",       employeeType: "psychologist" },
  ];

  const members: any[] = [];
  for (const td of teamData) {
    const existing = await prisma.teamMember.findFirst({ where: { name: td.name } });
    if (existing) {
      console.log(`  skip  Team member already exists: ${td.name}`);
      members.push(existing);
      continue;
    }
    const employeeCode = await genEmployeeCode(td.employeeType, prisma);
    const m = await prisma.teamMember.create({
      data: { name: td.name, employeeType: td.employeeType, employeeCode, isActive: true },
    });
    members.push(m);
    console.log(`  ✓  Team member: ${m.name} [${m.employeeCode}]`);
  }

  console.log(`\n  Created/found ${members.length} team members\n`);

  // ── 2. Patients ────────────────────────────────────────────────────────

  const patientData = [
    {
      name: "Arjun Kapoor",       mobile: "9876541001", email: "arjun.kapoor@gmail.com",   age: 28,
      source: "Patient referral", referred_by: "Sunita Kapoor",  therapistIdx: 0,
      status: "started_therapy",
    },
    {
      name: "Priya Sharma",       mobile: "9876541002", email: "priya.sharma@outlook.com",  age: 34,
      source: "Doctor referral",  referred_by: "Dr. Ramesh Patel", therapistIdx: 2,
      status: "discovery_completed",
    },
    {
      name: "Mohammed Farhan",    mobile: "9876541003", email: "farhan.m@gmail.com",         age: 22,
      source: "Events",           referred_by: null, therapistIdx: 1,
      status: "discovery_scheduled",
    },
    {
      name: "Kavya Reddy",        mobile: "9876541004", email: "kavya.reddy@yahoo.com",      age: 41,
      source: "Other referral",   referred_by: "Community Health Camp", therapistIdx: 4,
      status: "started_therapy",
    },
    {
      name: "Siddharth Nair",     mobile: "9876541005", email: "sid.nair@gmail.com",         age: 19,
      source: "Patient referral", referred_by: "Aditya Nair", therapistIdx: 6,
      status: "therapy_paused",
    },
    {
      name: "Deepika Joshi",      mobile: "9876541006", email: "deepika.j@hotmail.com",      age: 52,
      source: "Doctor referral",  referred_by: "Dr. Anjali Das", therapistIdx: 3,
      status: "schedule_completed",
    },
    {
      name: "Rahul Bhatia",       mobile: "9876541007", email: "rahul.bhatia@gmail.com",     age: 31,
      source: "Events",           referred_by: null, therapistIdx: 0,
      status: "created",
    },
    {
      name: "Ananya Singh",       mobile: "9876541008", email: "ananya.s@gmail.com",          age: 26,
      source: "Patient referral", referred_by: "Pooja Singh", therapistIdx: 7,
      status: "discovery_scheduled",
    },
    {
      name: "Varun Malhotra",     mobile: "9876541009", email: "varun.m@gmail.com",           age: 45,
      source: "Doctor referral",  referred_by: "Dr. Priya Menon", therapistIdx: 2,
      status: "patient_dropped",
    },
    {
      name: "Sunita Agarwal",     mobile: "9876541010", email: "sunita.a@rediffmail.com",    age: 38,
      source: "Other referral",   referred_by: "NGO Partner", therapistIdx: 4,
      status: "started_therapy",
    },
  ];

  const patients: any[] = [];
  for (const pd of patientData) {
    const existing = await prisma.patient.findFirst({ where: { mobile: pd.mobile } });
    if (existing) {
      console.log(`  skip  Patient already exists: ${pd.name}`);
      patients.push(existing);
      continue;
    }

    const therapist = members[pd.therapistIdx];
    const patient = await prisma.$transaction(async (tx) => {
      const patientNumber = await genPatientNumber(tx as any);
      const p = await tx.patient.create({
        data: {
          patientNumber,
          name: pd.name,
          mobile: pd.mobile,
          email: pd.email,
          age: pd.age,
          source: pd.source,
          referredBy: pd.referred_by,
          currentStatus: pd.status,
          therapistId: therapist.id,
        },
      });
      // Initial status log
      await tx.patientStatusLog.create({
        data: {
          patientId: p.id,
          previousStatus: null,
          newStatus: "created",
          changedByName: "system",
          notes: "Patient registered",
        },
      });
      // Additional status log if not still at "created"
      if (pd.status !== "created") {
        await tx.patientStatusLog.create({
          data: {
            patientId: p.id,
            previousStatus: "created",
            newStatus: pd.status,
            changedByName: "Admin",
            notes: `Status updated to ${pd.status}`,
          },
        });
      }
      return p;
    });

    patients.push(patient);
    console.log(`  ✓  Patient: ${patient.name} [${patient.patientNumber}] → ${pd.status}`);
  }

  console.log(`\n  Created/found ${patients.length} patients\n`);

  // ── 3. Therapy Sessions ────────────────────────────────────────────────
  // Mix of completed (past), upcoming (future), and cancelled sessions

  type SessionSeed = {
    patientIdx: number;
    therapistIdx: number;
    date: string;
    time: string;
    durationMins: number;
    status: "upcoming" | "completed" | "cancelled";
    notes?: string;
    cancelReason?: string;
    charges?: number;
  };

  const sessionData: SessionSeed[] = [
    // Completed sessions (past dates) — with charges
    { patientIdx: 0, therapistIdx: 0, date: "2026-02-10", time: "10:00", durationMins: 50, charges: 1500, status: "completed", notes: "Initial assessment completed. Patient showing mild anxiety symptoms." },
    { patientIdx: 0, therapistIdx: 0, date: "2026-02-17", time: "10:00", durationMins: 50, charges: 1500, status: "completed", notes: "CBT session 1 — introduced thought records." },
    { patientIdx: 1, therapistIdx: 2, date: "2026-02-12", time: "11:30", durationMins: 30, charges: 1000, status: "completed", notes: "Discovery session. Patient discussed work-related stress." },
    { patientIdx: 1, therapistIdx: 2, date: "2026-02-19", time: "11:30", durationMins: 50, charges: 1500, status: "completed", notes: "Follow-up. Sleep hygiene techniques discussed." },
    { patientIdx: 3, therapistIdx: 4, date: "2026-02-15", time: "14:00", durationMins: 50, charges: 2000, status: "completed", notes: "Couples therapy intake. Conflict resolution strategies introduced." },
    { patientIdx: 3, therapistIdx: 4, date: "2026-02-22", time: "14:00", durationMins: 50, charges: 2000, status: "completed", notes: "Progress session. Patient reports improved communication." },
    { patientIdx: 5, therapistIdx: 3, date: "2026-01-20", time: "09:00", durationMins: 50, charges: 1800, status: "completed", notes: "Session 8 — schedule completed. Patient discharged." },
    { patientIdx: 9, therapistIdx: 4, date: "2026-02-28", time: "16:00", durationMins: 30, charges: 1200, status: "completed", notes: "Grief counselling session 2." },

    // Cancelled sessions
    { patientIdx: 2, therapistIdx: 1, date: "2026-03-05", time: "10:30", durationMins: 60,  status: "cancelled", cancelReason: "Patient called in sick. Rescheduled to next week." },
    { patientIdx: 4, therapistIdx: 6, date: "2026-03-10", time: "15:00", durationMins: 60,  status: "cancelled", cancelReason: "Therapist unavailable — emergency leave." },
    { patientIdx: 7, therapistIdx: 7, date: "2026-03-12", time: "11:00", durationMins: 45,  status: "cancelled", cancelReason: "Patient requested to postpone — travel." },

    // Upcoming sessions (future dates)
    { patientIdx: 0, therapistIdx: 0, date: "2026-03-24", time: "10:00", durationMins: 60,  status: "upcoming", notes: "CBT session 3 — behavioural activation." },
    { patientIdx: 1, therapistIdx: 2, date: "2026-03-25", time: "11:30", durationMins: 60,  status: "upcoming" },
    { patientIdx: 2, therapistIdx: 1, date: "2026-03-22", time: "10:30", durationMins: 60,  status: "upcoming", notes: "Rescheduled discovery session." },
    { patientIdx: 3, therapistIdx: 4, date: "2026-03-26", time: "14:00", durationMins: 90,  status: "upcoming" },
    { patientIdx: 4, therapistIdx: 6, date: "2026-03-28", time: "15:00", durationMins: 60,  status: "upcoming", notes: "Follow-up after pause." },
    { patientIdx: 6, therapistIdx: 0, date: "2026-03-23", time: "09:30", durationMins: 45,  status: "upcoming", notes: "Discovery/intake session." },
    { patientIdx: 7, therapistIdx: 7, date: "2026-03-27", time: "11:00", durationMins: 45,  status: "upcoming" },
    { patientIdx: 8, therapistIdx: 2, date: "2026-03-29", time: "13:00", durationMins: 60,  status: "upcoming", notes: "Final session before discharge." },
    { patientIdx: 9, therapistIdx: 4, date: "2026-04-01", time: "16:00", durationMins: 60,  status: "upcoming" },
    { patientIdx: 5, therapistIdx: 3, date: "2026-04-02", time: "09:00", durationMins: 60,  status: "upcoming", notes: "Booster session." },
    { patientIdx: 1, therapistIdx: 2, date: "2026-04-08", time: "11:30", durationMins: 60,  status: "upcoming" },
    { patientIdx: 0, therapistIdx: 0, date: "2026-04-07", time: "10:00", durationMins: 60,  status: "upcoming" },
    { patientIdx: 3, therapistIdx: 4, date: "2026-04-09", time: "14:00", durationMins: 90,  status: "upcoming" },
    { patientIdx: 9, therapistIdx: 4, date: "2026-04-15", time: "16:00", durationMins: 45,  status: "upcoming" },
  ];

  let sessionCount = 0;
  for (const sd of sessionData) {
    const patient = patients[sd.patientIdx];
    const therapist = members[sd.therapistIdx];
    if (!patient || !therapist) continue;

    const startTime = dt(sd.date, sd.time);
    const endTime = sd.status === "completed" ? new Date(startTime.getTime() + sd.durationMins * 60 * 1000) : addMins(startTime, sd.durationMins);

    // Check for exact duplicate
    const dup = await prisma.therapySession.findFirst({
      where: { patientId: patient.id, startTime },
    });
    if (dup) {
      console.log(`  skip  Session already exists: ${patient.name} on ${sd.date}`);
      continue;
    }

    await prisma.therapySession.create({
      data: {
        patientId: patient.id,
        teamMemberId: therapist.id,
        startTime,
        endTime,
        durationMins: sd.durationMins,
        status: sd.status,
        notes: sd.notes ?? null,
        cancelReason: sd.cancelReason ?? null,
        charges: sd.charges !== undefined ? sd.charges : null,
      },
    });
    sessionCount++;
    console.log(`  ✓  Session: ${patient.name} ↔ ${therapist.name} on ${sd.date} [${sd.status}]`);
  }

  console.log(`\n  Created ${sessionCount} sessions`);

  console.log("\n✅ Seed complete!\n");
  console.log("Summary:");
  console.log(`  Team members : ${members.length}`);
  console.log(`  Patients     : ${patients.length}`);
  console.log(`  Sessions     : ${sessionCount} (8 completed, 3 cancelled, 14 upcoming)`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
