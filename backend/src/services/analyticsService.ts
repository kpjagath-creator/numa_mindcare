// Analytics service — aggregates dashboard KPIs and revenue stats from existing tables.

import prisma from "../lib/prisma";

// ── Shared session include ─────────────────────────────────────────────────────

const sessionInclude = {
  patient:    { select: { id: true, name: true, patientNumber: true } },
  teamMember: { select: { id: true, name: true, employeeType: true } },
} as const;

// ── Date helpers ───────────────────────────────────────────────────────────────
//
// Every bucket boundary here is a **clinic** calendar boundary (TZ-01). These previously used
// `getFullYear()`/`getMonth()`/`getDate()`/`getDay()`, which read the *server's* timezone — on
// Render (UTC) "today" would have started at 05:30 IST, so a 9am clinic session would have been
// counted against the previous day, and the same query would answer differently depending on
// where the backend ran. `session.startTime` is an absolute instant, so the comparison bounds
// must be the instants at which the clinic's day/week/month actually begin and end.

import { clinicDayBoundsOf, clinicMonthBounds, clinicParts, clinicWeekBounds } from "../lib/clinicTime";

function startOfDay(d: Date): Date { return clinicDayBoundsOf(d).start; }
function endOfDay(d: Date): Date { return clinicDayBoundsOf(d).end; }
function startOfWeek(d: Date): Date { return clinicWeekBounds(d).start; }
function endOfWeek(d: Date): Date { return clinicWeekBounds(d).end; }
function startOfMonth(y: number, m: number): Date { return clinicMonthBounds(y, m).start; }
function endOfMonth(y: number, m: number): Date { return clinicMonthBounds(y, m).end; }

// Converts groupBy status result into { completed, cancelled, upcoming }
function statusCounts(groups: { status: string; _count: { _all: number } }[]) {
  const map: Record<string, number> = {};
  for (const g of groups) map[g.status] = g._count._all;
  return {
    completed: map["completed"] ?? 0,
    cancelled: map["cancelled"] ?? 0,
    upcoming:  map["upcoming"]  ?? 0,
  };
}

// ── getDashboardStats ──────────────────────────────────────────────────────────

export async function getDashboardStats() {
  const now   = new Date();
  const today = startOfDay(now);
  const todayEnd = endOfDay(now);
  const wkStart  = startOfWeek(now);
  const wkEnd    = endOfWeek(now);
  // Which calendar month "now" falls in is itself a clinic question — near midnight IST the
  // server's UTC clock is still on the previous day, and at month boundaries the previous month.
  const nowClinic = clinicParts(now);
  const monthIndex = nowClinic.month - 1; // clinicParts is 1-12; month bounds take 0-based
  const mStart   = startOfMonth(nowClinic.year, monthIndex);
  const mEnd     = endOfMonth(nowClinic.year, monthIndex);
  // Last month
  const lmStart  = startOfMonth(nowClinic.year, monthIndex - 1);
  const lmEnd    = endOfMonth(nowClinic.year, monthIndex - 1);

  const [
    totalActivePatients,
    newPatientsThisMonth,
    weekGroups,
    monthGroups,
    revenueThisMonthAgg,
    revenueLastMonthAgg,
    upcomingToday,
    upcomingThisWeekCount,
    weekTherapistGroups,
    referralGroups,
  ] = await Promise.all([
    prisma.patient.count({
      where: { currentStatus: { notIn: ["discharged", "dropped"] } },
    }),
    prisma.patient.count({
      where: { createdAt: { gte: mStart, lte: mEnd } },
    }),
    prisma.therapySession.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: { startTime: { gte: wkStart, lte: wkEnd } },
    }),
    prisma.therapySession.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: { startTime: { gte: mStart, lte: mEnd } },
    }),
    prisma.therapySession.aggregate({
      _sum: { charges: true },
      where: { status: "completed", startTime: { gte: mStart, lte: mEnd } },
    }),
    prisma.therapySession.aggregate({
      _sum: { charges: true },
      where: { status: "completed", startTime: { gte: lmStart, lte: lmEnd } },
    }),
    prisma.therapySession.findMany({
      where: { status: "upcoming", startTime: { gte: today, lte: todayEnd } },
      include: sessionInclude,
      orderBy: { startTime: "asc" },
    }),
    prisma.therapySession.count({
      where: { status: "upcoming", startTime: { gte: wkStart, lte: wkEnd } },
    }),
    prisma.therapySession.groupBy({
      by: ["teamMemberId"],
      _count: { _all: true },
      where: { startTime: { gte: wkStart, lte: wkEnd } },
    }),
    prisma.patient.groupBy({
      by: ["source"],
      _count: { _all: true },
      orderBy: { _count: { source: "desc" } },
    }),
  ]);

  // Fetch team member names for utilisation
  const therapistIds = weekTherapistGroups.map((g) => g.teamMemberId);
  const therapists = therapistIds.length
    ? await prisma.teamMember.findMany({
        where: { id: { in: therapistIds } },
        select: { id: true, name: true },
      })
    : [];
  const therapistMap: Record<number, string> = {};
  for (const t of therapists) therapistMap[t.id] = t.name;

  const therapistUtilisation = weekTherapistGroups
    .map((g) => ({
      id:               g.teamMemberId,
      name:             therapistMap[g.teamMemberId] ?? `Therapist #${g.teamMemberId}`,
      sessionsThisWeek: g._count._all,
    }))
    .sort((a, b) => b.sessionsThisWeek - a.sessionsThisWeek);

  const referralSources = referralGroups.map((g) => ({
    source: g.source ?? "Unknown",
    count:  g._count._all,
  }));

  return {
    totalActivePatients,
    newPatientsThisMonth,
    sessionsThisWeek:  statusCounts(weekGroups),
    sessionsThisMonth: statusCounts(monthGroups),
    revenueThisMonth:  Number(revenueThisMonthAgg._sum.charges ?? 0),
    revenueLastMonth:  Number(revenueLastMonthAgg._sum.charges ?? 0),
    upcomingToday: upcomingToday.map((s) => ({
      id:           s.id,
      patientName:  s.patient.name,
      therapistName: s.teamMember.name,
      startTime:    s.startTime,
      durationMins: s.durationMins,
    })),
    upcomingThisWeekCount,
    therapistUtilisation,
    referralSources,
  };
}

// ── getRevenueStats ────────────────────────────────────────────────────────────

export async function getRevenueStats() {
  const now = new Date();

  // Last 6 months (including current)
  const months: { label: string; start: Date; end: Date }[] = [];
  const nowClinic = clinicParts(now);
  for (let i = 5; i >= 0; i--) {
    // Offset can go negative; normalise the same way `clinicMonthBounds` does so the label and
    // the bounds always describe the same month.
    const offset = nowClinic.month - 1 - i;
    const year = nowClinic.year + Math.floor(offset / 12);
    const month = ((offset % 12) + 12) % 12;
    const label = `${year}-${String(month + 1).padStart(2, "0")}`;
    months.push({ label, start: startOfMonth(year, month), end: endOfMonth(year, month) });
  }

  // Monthly revenue aggregations
  const monthlyRaw = await Promise.all(
    months.map(({ start, end }) =>
      prisma.therapySession.aggregate({
        _sum:   { charges: true },
        _count: { _all: true },
        where:  { status: "completed", startTime: { gte: start, lte: end } },
      })
    )
  );
  const monthlyRevenue = months.map((m, i) => ({
    month:        m.label,
    revenue:      Number(monthlyRaw[i]._sum.charges ?? 0),
    sessionCount: monthlyRaw[i]._count._all,
  }));

  // Revenue by therapist
  const [byTherapistGroups, allTherapists, outstandingSessions, totalAgg, totalCompleted] =
    await Promise.all([
      prisma.therapySession.groupBy({
        by:    ["teamMemberId"],
        _sum:  { charges: true },
        _count: { _all: true },
        where: { status: "completed" },
      }),
      prisma.teamMember.findMany({ select: { id: true, name: true } }),
      prisma.therapySession.findMany({
        where:   { status: "completed", charges: null },
        include: sessionInclude,
        orderBy: { startTime: "desc" },
      }),
      prisma.therapySession.aggregate({
        _sum: { charges: true },
        where: { status: "completed" },
      }),
      prisma.therapySession.count({ where: { status: "completed" } }),
    ]);

  const therapistNameMap: Record<number, string> = {};
  for (const t of allTherapists) therapistNameMap[t.id] = t.name;

  const revenueByTherapist = byTherapistGroups
    .map((g) => ({
      id:           g.teamMemberId,
      name:         therapistNameMap[g.teamMemberId] ?? `Therapist #${g.teamMemberId}`,
      revenue:      Number(g._sum.charges ?? 0),
      sessionCount: g._count._all,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = Number(totalAgg._sum.charges ?? 0);
  const avgCharge    = totalCompleted > 0 ? Math.round(totalRevenue / totalCompleted) : 0;

  return {
    monthlyRevenue,
    revenueByTherapist,
    outstandingSessions: outstandingSessions.map((s) => ({
      id:           s.id,
      patientName:  s.patient.name,
      patientNumber: s.patient.patientNumber,
      therapistName: s.teamMember.name,
      startTime:    s.startTime,
      durationMins: s.durationMins,
    })),
    totalRevenue,
    totalCompletedSessions: totalCompleted,
    averageChargePerSession: avgCharge,
  };
}
