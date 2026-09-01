// Clinic timezone display boundary (TZ-01).
//
// Session times are absolute instants (ISO strings from the API). Rendering them with a bare
// `toLocaleTimeString()` formats them in the *viewer's browser* timezone, so the same appointment
// would read differently to a staff member travelling, on a laptop with a wrong clock, or in any
// future non-IST location. Numa is a single-clinic product: an appointment's time is a fact about
// the clinic, not about whoever is looking at the screen.
//
// Every date/time the app renders therefore goes through these helpers, which pin the timezone
// explicitly. Mirrors `backend/src/lib/clinicTime.ts`; kept as a separate tiny module rather than
// shared because the two packages have no build-level code sharing and this is ~40 lines.
//
// Note this is display only. The instants themselves are resolved on the backend — the frontend
// sends `session_date` + `start_time` as clinic wall-clock strings and never constructs an
// instant from them.

export const CLINIC_TIME_ZONE = "Asia/Kolkata";

/** "10:00 am" */
export function fmtClinicTime(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    timeZone: CLINIC_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/** "15 Sept 2026" */
export function fmtClinicDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    timeZone: CLINIC_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** "15 Sept 2026, 10:00 am" */
export function fmtClinicDateTime(iso: string | Date): string {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: CLINIC_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "Tue" */
export function fmtClinicWeekday(iso: string | Date): string {
  return new Date(iso).toLocaleDateString("en-IN", { timeZone: CLINIC_TIME_ZONE, weekday: "short" });
}

/** "15 Sept" */
export function fmtClinicDayMonth(iso: string | Date): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    timeZone: CLINIC_TIME_ZONE,
    day: "2-digit",
    month: "short",
  });
}

/**
 * "15 Sept 2026" for a plain `YYYY-MM-DD` calendar string (a date input value, a blockout date) —
 * *not* an instant. Formatting these by building a local `Date` and hoping the time-of-day gives
 * enough headroom is the usual trick; anchoring to UTC noon and formatting in UTC removes the
 * guesswork entirely, and a bare calendar date has no timezone to convert anyway.
 */
export function fmtClinicDateOnly(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * 0 = Sunday … 6 = Saturday for a plain `YYYY-MM-DD` calendar string, matching
 * `TherapistAvailability.dayOfWeek`. Anchored to UTC so it cannot drift with the viewer's zone —
 * the previous `new Date(ymd + "T12:00:00").getDay()` relied on noon giving enough headroom.
 */
export function dayOfWeekForDate(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return NaN;
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * "YYYY-MM-DD" for the clinic day an instant falls in — used where a date is fed back into a
 * `<input type="date">` or an API filter, both of which expect a clinic calendar date.
 * `en-CA` yields ISO-ordered output, which is the least fragile way to get this from Intl.
 */
export function clinicDateInputValue(iso: string | Date = new Date()): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: CLINIC_TIME_ZONE });
}

/** "HH:MM" (24h) for the clinic time an instant falls in — for `<input type="time">` values. */
export function clinicTimeInputValue(iso: string | Date = new Date()): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: CLINIC_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
