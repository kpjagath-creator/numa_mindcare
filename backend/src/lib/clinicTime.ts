// Clinic timezone boundary (TZ-01).
//
// Numa is a single-clinic product, and every scheduling input an admin types is a **clinic
// wall-clock** time. The database stores **absolute instants** (`therapy_sessions.start_time` is
// `TIMESTAMP(3)`, which Prisma round-trips as a UTC instant). Something has to convert between
// the two, and until this module existed that conversion was implicit:
//
//     new Date(`${session_date}T${start_time}:00`)   // no offset → parsed in SERVER-local time
//
// which meant the instant Numa stored depended on where the backend happened to run. On Render
// (containers default to UTC, and `render.yaml` sets no `TZ`) a 10:00 booking was stored as
// 10:00Z — 15:30 in Kolkata. The Numa UI already rendered that wrongly, and a Google Calendar
// invitation would have told the patient the wrong appointment time.
//
// This module is the single place that knows about the clinic's timezone. Two rules:
//
//   1. **Never use server-local date accessors on a session instant.** `getHours()`, `getDay()`,
//      `getFullYear()`, `toDateString()` and bare `toLocaleTimeString()` all read the *server's*
//      zone. Use `clinicParts` / `formatClinicTime` instead.
//   2. **Never build a Date from a bare wall-clock string.** `new Date("2026-09-15T10:00:00")` is
//      server-local. Use `clinicWallClockToUtc`.
//
// Implementation note — no dependency was added. `Intl.DateTimeFormat` with an IANA `timeZone`
// gives correct, DST-aware conversion in ~30 lines, and Node ≥20 (pinned in `engines`) ships full
// ICU. Luxon or date-fns-tz would work but add a package to do what the platform already does;
// this repo deliberately keeps its dependency set small (ARCHITECTURE.md §15).

/**
 * The clinic's IANA timezone. Overridable by env so a future deployment in another city needs no
 * code change — but deliberately *not* a per-clinic setting, per-user preference, or database
 * column: Numa is single-clinic and multi-timezone scheduling is an explicit non-goal.
 */
export const CLINIC_TIME_ZONE = process.env.CLINIC_TIME_ZONE ?? "Asia/Kolkata";

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CLINIC_TIME_ZONE,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
});

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

export interface ClinicParts {
  year: number;
  /** 1-12, not the 0-based month of the Date API. */
  month: number;
  day: number;
  /** 0 = Sunday … 6 = Saturday, matching `TherapistAvailability.dayOfWeek`. */
  dayOfWeek: number;
  /** "HH:MM", directly comparable with the TEXT columns on `TherapistAvailability`. */
  hhmm: string;
  /** "YYYY-MM-DD" in clinic time. */
  ymd: string;
}

/** Breaks an absolute instant into its clinic-local calendar/clock parts. */
export function clinicParts(instant: Date): ClinicParts {
  const p = Object.fromEntries(
    partsFormatter.formatToParts(instant).map((part) => [part.type, part.value])
  ) as Record<string, string>;

  // Intl emits hour "24" for midnight under hour12:false in some ICU versions.
  const hour = p.hour === "24" ? "00" : p.hour;

  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    dayOfWeek: WEEKDAY_INDEX[p.weekday] ?? 0,
    hhmm: `${hour}:${p.minute}`,
    ymd: `${p.year}-${p.month}-${p.day}`,
  };
}

/**
 * How far the clinic zone is ahead of UTC at a given instant, in milliseconds.
 * Computed from the instant itself rather than assumed, so a zone with DST stays correct.
 */
function clinicOffsetMs(instant: Date): number {
  const p = clinicParts(instant);
  const hour = Number(p.hhmm.slice(0, 2));
  const minute = Number(p.hhmm.slice(3, 5));
  const seconds = Number(
    (Object.fromEntries(
      partsFormatter.formatToParts(instant).map((part) => [part.type, part.value])
    ) as Record<string, string>).second
  );
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, hour, minute, seconds, instant.getUTCMilliseconds());
  return asIfUtc - instant.getTime();
}

/**
 * Converts a clinic wall-clock date + time into the absolute instant it denotes.
 *
 *   clinicWallClockToUtc("2026-09-15", "10:00")  →  2026-09-15T04:30:00.000Z
 *
 * The result is identical no matter what timezone the process runs in — that independence is the
 * entire point of this function. Returns an Invalid Date for malformed input so callers keep
 * their existing `isNaN(...)` → 400 handling.
 */
export function clinicWallClockToUtc(dateStr: string, timeStr: string): Date {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeStr);
  if (!dateMatch || !timeMatch) return new Date(NaN);

  const [, y, mo, d] = dateMatch;
  const [, h, mi] = timeMatch;

  // Treat the wall clock as if it were UTC, then subtract however far the clinic zone sits ahead
  // of UTC at that moment. The second pass matters only for zones with DST, where the offset at
  // the guessed instant can differ from the offset at the true instant; it is a no-op for a
  // fixed-offset zone like Asia/Kolkata but keeps the helper correct if the clinic ever moves.
  const guess = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), 0, 0);
  if (Number.isNaN(guess)) return new Date(NaN);

  const firstPass = guess - clinicOffsetMs(new Date(guess));
  const secondPass = guess - clinicOffsetMs(new Date(firstPass));
  return new Date(secondPass);
}

/**
 * The absolute instants bounding a clinic calendar day — used for "sessions on this date"
 * filtering and for analytics buckets, both of which previously used server-local midnight.
 * `end` is exclusive-in-spirit but returned as the last millisecond to suit the existing
 * `lte` queries.
 */
export function clinicDayBounds(dateStr: string): { start: Date; end: Date } {
  const start = clinicWallClockToUtc(dateStr, "00:00");
  if (Number.isNaN(start.getTime())) return { start, end: start };
  // Next clinic midnight minus 1ms — computed by adding a day in clinic terms rather than 24h,
  // so a DST transition can never produce a 23- or 25-hour day.
  const next = new Date(start.getTime() + 36 * 60 * 60 * 1000); // safely inside the next day
  const nextParts = clinicParts(next);
  const nextMidnight = clinicWallClockToUtc(
    `${nextParts.year}-${String(nextParts.month).padStart(2, "0")}-${String(nextParts.day).padStart(2, "0")}`,
    "00:00"
  );
  return { start, end: new Date(nextMidnight.getTime() - 1) };
}

/** `clinicDayBounds` for the clinic day that a given instant falls in. */
export function clinicDayBoundsOf(instant: Date): { start: Date; end: Date } {
  return clinicDayBounds(clinicParts(instant).ymd);
}

/** Monday-based week containing `instant`, in clinic days. */
export function clinicWeekBounds(instant: Date): { start: Date; end: Date } {
  const { dayOfWeek } = clinicParts(instant);
  const backToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const dayStart = clinicDayBoundsOf(instant).start;
  const mondayish = new Date(dayStart.getTime() - backToMonday * 24 * 60 * 60 * 1000);
  const start = clinicDayBoundsOf(mondayish).start;
  const sundayish = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000);
  return { start, end: clinicDayBoundsOf(sundayish).end };
}

/**
 * Calendar-month bounds in clinic time. `monthIndex` is 0-based and may be out of range
 * (e.g. -1 for last December), matching the arithmetic the analytics service already does.
 */
export function clinicMonthBounds(year: number, monthIndex: number): { start: Date; end: Date } {
  const normalisedYear = year + Math.floor(monthIndex / 12);
  const normalisedMonth = ((monthIndex % 12) + 12) % 12;
  const first = `${normalisedYear}-${String(normalisedMonth + 1).padStart(2, "0")}-01`;
  const start = clinicDayBounds(first).start;

  const nextYear = normalisedMonth === 11 ? normalisedYear + 1 : normalisedYear;
  const nextMonth = normalisedMonth === 11 ? 0 : normalisedMonth + 1;
  const nextFirst = `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-01`;
  return { start, end: new Date(clinicDayBounds(nextFirst).start.getTime() - 1) };
}

const clinicTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: CLINIC_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Formats an instant as clinic wall-clock time. Used in conflict messages, which previously
 * quoted server-local times back to the admin.
 */
export function formatClinicTime(instant: Date): string {
  return clinicTimeFormatter.format(instant);
}
