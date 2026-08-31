// Minimal in-memory double for the slice of PrismaClient used by the lifecycle-related services
// under test (patient, teamMember, therapySession, patientStatusLog + $transaction with
// snapshot/restore rollback semantics). The repo has no test database wired up, so this is the
// smallest maintainable way to exercise real service/transaction logic without one. It is not a
// full Prisma reimplementation — only the operations these services actually call.

export type FakePatient = {
  id: number;
  name: string;
  patientNumber: string;
  currentStatus: string;
  therapistId: number | null;
  // MEET-01: the address Google Calendar invites the patient at.
  email: string;
};

export type FakeTeamMember = {
  id: number;
  name: string;
  employeeType: string;
  isActive: boolean;
  // MEET-01: nullable - therapist records predating the integration have no email.
  email: string | null;
};

export type FakeAvailabilitySlot = {
  id: number;
  teamMemberId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

export type FakeBlockout = {
  id: number;
  teamMemberId: number;
  blockDate: Date;
  reason: string | null;
};

export type FakeSession = {
  id: number;
  patientId: number;
  teamMemberId: number;
  startTime: Date;
  endTime: Date;
  durationMins: number;
  sessionType: string;
  status: string;
  charges: number | null;
  notes: string | null;
  rescheduledFromId: number | null;
  paymentStatus: string;
  noShowFee: number | null;
  cancelReason: string | null;
  // MEET-01 Google Calendar integration state.
  meetingProvider: string | null;
  googleEventId: string | null;
  meetingLink: string | null;
  meetingStatus: string | null;
  meetingError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type FakeStatusLog = {
  id: number;
  patientId: number;
  previousStatus: string | null;
  newStatus: string;
  changedByName: string | null;
  notes: string | null;
  createdAt: Date;
};

export class FakeDb {
  patients = new Map<number, FakePatient>();
  teamMembers = new Map<number, FakeTeamMember>();
  sessions = new Map<number, FakeSession>();
  statusLogs: FakeStatusLog[] = [];
  // Availability defaults to "open every day, all day" so existing tests that don't care about
  // Capability 2 (availability-aware scheduling) aren't affected by it — tests that specifically
  // exercise availability/blockout rejection overwrite these for the therapist under test.
  availabilitySlots: FakeAvailabilitySlot[] = [];
  blockouts: FakeBlockout[] = [];
  nextSessionId = 1;
  nextLogId = 1;
  nextAvailabilityId = 1;
  nextBlockoutId = 1;

  reset(): void {
    this.patients.clear();
    this.teamMembers.clear();
    this.sessions.clear();
    this.statusLogs = [];
    this.availabilitySlots = [];
    this.blockouts = [];
    this.nextSessionId = 1;
    this.nextLogId = 1;
    this.nextAvailabilityId = 1;
    this.nextBlockoutId = 1;
  }
}

function snapshot(db: FakeDb): {
  patients: [number, FakePatient][];
  teamMembers: [number, FakeTeamMember][];
  sessions: [number, FakeSession][];
  statusLogs: FakeStatusLog[];
  nextSessionId: number;
  nextLogId: number;
} {
  return {
    patients: Array.from(db.patients, ([k, v]) => [k, { ...v }]),
    teamMembers: Array.from(db.teamMembers, ([k, v]) => [k, { ...v }]),
    sessions: Array.from(db.sessions, ([k, v]) => [k, { ...v }]),
    statusLogs: db.statusLogs.map((l) => ({ ...l })),
    nextSessionId: db.nextSessionId,
    nextLogId: db.nextLogId,
  };
}

function restore(db: FakeDb, snap: ReturnType<typeof snapshot>): void {
  db.patients = new Map(snap.patients);
  db.teamMembers = new Map(snap.teamMembers);
  db.sessions = new Map(snap.sessions);
  db.statusLogs = snap.statusLogs;
  db.nextSessionId = snap.nextSessionId;
  db.nextLogId = snap.nextLogId;
}

function matchesWhere(session: FakeSession, where: any): boolean {
  for (const [key, cond] of Object.entries(where ?? {})) {
    if (cond === undefined) continue;
    if (key === "startTime" && cond && typeof cond === "object" && "lt" in (cond as any)) {
      if (!(session.startTime < (cond as any).lt)) return false;
    } else if (key === "endTime" && cond && typeof cond === "object" && "gt" in (cond as any)) {
      if (!(session.endTime > (cond as any).gt)) return false;
    } else if (key === "status" && cond && typeof cond === "object" && "notIn" in (cond as any)) {
      if ((cond as any).notIn.includes(session.status)) return false;
    } else if (key === "id" && cond && typeof cond === "object" && "not" in (cond as any)) {
      if (session.id === (cond as any).not) return false;
    } else if (typeof cond !== "object") {
      if ((session as any)[key] !== cond) return false;
    }
  }
  return true;
}

function withParticipants(db: FakeDb, s: FakeSession) {
  const patient = db.patients.get(s.patientId);
  const teamMember = db.teamMembers.get(s.teamMemberId);
  return {
    ...s,
    // `email` is carried here so a `select` on the nested participant can reach it — MEET-01's
    // provisioning reads patient.email / teamMember.email to build the attendee list.
    patient: patient ? { id: patient.id, name: patient.name, patientNumber: patient.patientNumber, email: patient.email } : null,
    teamMember: teamMember ? { id: teamMember.id, name: teamMember.name, employeeType: teamMember.employeeType, email: teamMember.email } : null,
  };
}

// Minimal `select` support: keeps only the requested scalar keys, and recurses into a nested
// `{ select: {...} }` for the participant relations. Enough for the shapes the services under
// test actually ask for — not a general Prisma select implementation.
function project(row: any, select: any): any {
  if (row === null || row === undefined) return row;
  const out: any = {};
  for (const [key, spec] of Object.entries(select)) {
    if (spec === true) out[key] = row[key];
    else if (spec && typeof spec === "object" && "select" in (spec as any)) {
      out[key] = project(row[key], (spec as any).select);
    }
  }
  return out;
}

/** Builds a fake Prisma-shaped client (usable both as the top-level client and as a `tx`). */
export function createFakeClient(db: FakeDb): any {
  const client: any = {
    patient: {
      findUnique: async ({ where, include }: any) => {
        const p = db.patients.get(where.id);
        if (!p) return null;
        const therapist =
          include?.therapist && p.therapistId ? db.teamMembers.get(p.therapistId) ?? null : null;
        return include?.therapist ? { ...p, therapist: therapist ? { ...therapist } : null } : { ...p };
      },
      update: async ({ where, data, include }: any) => {
        const existing = db.patients.get(where.id);
        if (!existing) throw new Error("patient not found");
        const updated = { ...existing, ...data };
        db.patients.set(where.id, updated);
        const therapist =
          include?.therapist && updated.therapistId
            ? db.teamMembers.get(updated.therapistId) ?? null
            : null;
        return { ...updated, therapist: therapist ? { ...therapist } : null };
      },
      // Simulates Postgres's conditional-UPDATE compare-and-swap: only mutates rows matching
      // every plain-equality field in `where` (including a non-primary-key field like
      // currentStatus), and reports how many rows actually matched — same contract as
      // Prisma's real updateMany, which the lifecycle service relies on for concurrency safety.
      updateMany: async ({ where, data }: any) => {
        const existing = db.patients.get(where.id);
        if (!existing) return { count: 0 };
        const matches = Object.entries(where).every(([key, val]) => (existing as any)[key] === val);
        if (!matches) return { count: 0 };
        db.patients.set(where.id, { ...existing, ...data });
        return { count: 1 };
      },
    },
    teamMember: {
      findUnique: async ({ where }: any) => {
        const t = db.teamMembers.get(where.id);
        return t ? { ...t } : null;
      },
    },
    therapistAvailability: {
      findMany: async ({ where }: any) => {
        return db.availabilitySlots.filter(
          (s) => s.teamMemberId === where.teamMemberId && s.dayOfWeek === where.dayOfWeek
        );
      },
    },
    therapistBlockout: {
      findFirst: async ({ where }: any) => {
        const target = (where.blockDate as Date).getTime();
        return (
          db.blockouts.find((b) => b.teamMemberId === where.teamMemberId && b.blockDate.getTime() === target) ?? null
        );
      },
    },
    patientStatusLog: {
      create: async ({ data }: any) => {
        const log: FakeStatusLog = { id: db.nextLogId++, createdAt: new Date(), ...data };
        db.statusLogs.push(log);
        return log;
      },
    },
    therapySession: {
      findFirst: async ({ where }: any) => {
        for (const s of db.sessions.values()) {
          if (matchesWhere(s, where)) return withParticipants(db, s);
        }
        return null;
      },
      findUnique: async ({ where, select }: any) => {
        const s = db.sessions.get(where.id);
        if (!s) return null;
        const full = withParticipants(db, s);
        return select ? project(full, select) : full;
      },
      create: async ({ data }: any) => {
        const id = db.nextSessionId++;
        const now = new Date();
        const session: FakeSession = {
          id,
          patientId: data.patientId,
          teamMemberId: data.teamMemberId,
          startTime: data.startTime,
          endTime: data.endTime,
          durationMins: data.durationMins,
          sessionType: data.sessionType,
          status: data.status ?? "upcoming",
          charges: data.charges ?? null,
          notes: data.notes ?? null,
          rescheduledFromId: data.rescheduledFromId ?? null,
          paymentStatus: data.paymentStatus ?? "unpaid",
          noShowFee: data.noShowFee ?? null,
          cancelReason: data.cancelReason ?? null,
          meetingProvider: data.meetingProvider ?? null,
          googleEventId: data.googleEventId ?? null,
          meetingLink: data.meetingLink ?? null,
          meetingStatus: data.meetingStatus ?? null,
          meetingError: data.meetingError ?? null,
          createdAt: now,
          updatedAt: now,
        };
        db.sessions.set(id, session);
        return withParticipants(db, session);
      },
      update: async ({ where, data, select }: any) => {
        const existing = db.sessions.get(where.id);
        if (!existing) throw new Error("session not found");
        const updated = { ...existing, ...data, updatedAt: new Date() };
        db.sessions.set(where.id, updated);
        return select ? project(withParticipants(db, updated), select) : withParticipants(db, updated);
      },
      // Compare-and-swap, same contract as the patient.updateMany above: only rows matching every
      // plain-equality field in `where` are mutated, and the matched count is reported. MEET-01's
      // provisioning claim (`where: { id, googleEventId: null }`) depends on this.
      updateMany: async ({ where, data }: any) => {
        const existing = db.sessions.get(where.id);
        if (!existing) return { count: 0 };
        const matches = Object.entries(where).every(([key, val]) => (existing as any)[key] === val);
        if (!matches) return { count: 0 };
        db.sessions.set(where.id, { ...existing, ...data, updatedAt: new Date() });
        return { count: 1 };
      },
      delete: async ({ where }: any) => {
        const existing = db.sessions.get(where.id);
        if (!existing) throw new Error("session not found");
        db.sessions.delete(where.id);
        return withParticipants(db, existing);
      },
    },
    $transaction: async (fn: (tx: any) => Promise<any>) => {
      const snap = snapshot(db);
      try {
        return await fn(client);
      } catch (err) {
        restore(db, snap);
        throw err;
      }
    },
  };
  return client;
}
