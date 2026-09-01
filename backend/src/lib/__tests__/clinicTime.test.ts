// Clinic timezone boundary (TZ-01).
//
// The whole point of this module is that its output does **not** depend on the process timezone.
// Before it existed, `new Date("2026-09-15T10:00:00")` meant 04:30Z on a developer's IST machine
// and 10:00Z on Render (UTC) — the same booking landing on two different instants, and a patient
// invitation five and a half hours out.
//
// Vitest reads `process.env.TZ` once at startup, so the honest way to prove independence is to
// run the conversions in child processes under different `TZ` values and compare. `runUnderTZ`
// does exactly that; the rest of the suite covers behaviour in-process.

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  CLINIC_TIME_ZONE,
  clinicDayBounds,
  clinicDayBoundsOf,
  clinicMonthBounds,
  clinicParts,
  clinicWallClockToUtc,
  clinicWeekBounds,
  formatClinicTime,
} from "../clinicTime";

const LIB = path.join(__dirname, "..", "clinicTime.ts").replace(/\\/g, "/");

/** Runs an expression against the real module in a child process pinned to `tz`. */
function runUnderTZ(tz: string, expression: string): string {
  const script = `require("ts-node").register({ transpileOnly: true, compilerOptions: { module: "CommonJS" } });
const ct = require("${LIB}");
process.stdout.write(String(${expression}));`;
  return execFileSync(process.execPath, ["-e", script], {
    env: { ...process.env, TZ: tz },
    encoding: "utf8",
  }).trim();
}

describe("clinicWallClockToUtc — the conversion the whole fix rests on", () => {
  it("resolves 15 Sep 2026 10:00 clinic time to 04:30 UTC", () => {
    expect(clinicWallClockToUtc("2026-09-15", "10:00").toISOString()).toBe("2026-09-15T04:30:00.000Z");
  });

  it("defaults to the clinic's zone", () => {
    expect(CLINIC_TIME_ZONE).toBe("Asia/Kolkata");
  });

  it("returns an Invalid Date for malformed input, preserving the existing 400 path", () => {
    expect(Number.isNaN(clinicWallClockToUtc("not-a-date", "10:00").getTime())).toBe(true);
    expect(Number.isNaN(clinicWallClockToUtc("2026-09-15", "9:00").getTime())).toBe(true);
    expect(Number.isNaN(clinicWallClockToUtc("", "").getTime())).toBe(true);
  });

  it("handles midnight and end-of-day without drifting a day", () => {
    expect(clinicWallClockToUtc("2026-09-15", "00:00").toISOString()).toBe("2026-09-14T18:30:00.000Z");
    expect(clinicWallClockToUtc("2026-09-15", "23:30").toISOString()).toBe("2026-09-15T18:00:00.000Z");
  });
});

describe("environment independence — the regression this exists to prevent", () => {
  it("resolves the same instant under a UTC runtime and an Asia/Kolkata runtime", () => {
    const expr = `ct.clinicWallClockToUtc("2026-09-15", "10:00").toISOString()`;
    const underUtc = runUnderTZ("UTC", expr);
    const underIst = runUnderTZ("Asia/Kolkata", expr);

    expect(underUtc).toBe("2026-09-15T04:30:00.000Z");
    expect(underIst).toBe("2026-09-15T04:30:00.000Z");
    expect(underUtc).toBe(underIst);
  });

  it("resolves the same instant under a runtime west of UTC", () => {
    // A negative-offset zone would previously push the instant the *other* way, so this covers a
    // different failure direction than UTC does.
    const expr = `ct.clinicWallClockToUtc("2026-09-15", "10:00").toISOString()`;
    expect(runUnderTZ("America/New_York", expr)).toBe("2026-09-15T04:30:00.000Z");
  });

  it("reads clinic wall-clock parts identically under both runtimes", () => {
    const expr = `JSON.stringify(ct.clinicParts(new Date("2026-09-15T04:30:00.000Z")))`;
    expect(runUnderTZ("UTC", expr)).toBe(runUnderTZ("Asia/Kolkata", expr));
    expect(JSON.parse(runUnderTZ("UTC", expr))).toMatchObject({
      year: 2026, month: 9, day: 15, dayOfWeek: 2, hhmm: "10:00", ymd: "2026-09-15",
    });
  });

  it("computes the same clinic day bounds under both runtimes", () => {
    const expr = `ct.clinicDayBounds("2026-09-15").start.toISOString() + "|" + ct.clinicDayBounds("2026-09-15").end.toISOString()`;
    expect(runUnderTZ("UTC", expr)).toBe(runUnderTZ("Asia/Kolkata", expr));
    expect(runUnderTZ("UTC", expr)).toBe("2026-09-14T18:30:00.000Z|2026-09-15T18:29:59.999Z");
  });

  it("demonstrates the old server-local parse was the bug", () => {
    // The pattern this fix replaced, evaluated in each runtime. It disagrees with itself; the
    // clinic helper above does not. This is the difference the whole change turns on.
    const legacy = `new Date("2026-09-15T10:00:00").toISOString()`;
    expect(runUnderTZ("UTC", legacy)).toBe("2026-09-15T10:00:00.000Z");
    expect(runUnderTZ("Asia/Kolkata", legacy)).toBe("2026-09-15T04:30:00.000Z");
    expect(runUnderTZ("UTC", legacy)).not.toBe(runUnderTZ("Asia/Kolkata", legacy));
  });
});

describe("clinicParts — reading an instant in clinic terms", () => {
  it("maps an instant to the clinic weekday used by TherapistAvailability", () => {
    // 2026-09-15 is a Tuesday in Kolkata.
    expect(clinicParts(new Date("2026-09-15T04:30:00.000Z")).dayOfWeek).toBe(2);
  });

  it("reports the clinic day for an instant that falls on the previous UTC day", () => {
    // 03:00 IST on the 15th is 21:30Z on the 14th — the clinic day is what matters.
    const parts = clinicParts(new Date("2026-09-14T21:30:00.000Z"));
    expect(parts.ymd).toBe("2026-09-15");
    expect(parts.hhmm).toBe("03:00");
  });

  it("round-trips with clinicWallClockToUtc", () => {
    const instant = clinicWallClockToUtc("2026-09-15", "10:00");
    const parts = clinicParts(instant);
    expect(parts.ymd).toBe("2026-09-15");
    expect(parts.hhmm).toBe("10:00");
  });
});

describe("clinic day / week / month bounds", () => {
  it("bounds a clinic day at clinic midnight, not UTC midnight", () => {
    const { start, end } = clinicDayBounds("2026-09-15");
    expect(start.toISOString()).toBe("2026-09-14T18:30:00.000Z");
    expect(end.toISOString()).toBe("2026-09-15T18:29:59.999Z");
  });

  it("derives day bounds from an instant", () => {
    const { start } = clinicDayBoundsOf(new Date("2026-09-15T04:30:00.000Z"));
    expect(start.toISOString()).toBe("2026-09-14T18:30:00.000Z");
  });

  it("bounds a Monday-based clinic week", () => {
    // Tuesday 15 Sep 2026 → week runs Mon 14 Sep to Sun 20 Sep, clinic time.
    const { start, end } = clinicWeekBounds(new Date("2026-09-15T04:30:00.000Z"));
    expect(start.toISOString()).toBe("2026-09-13T18:30:00.000Z");
    expect(end.toISOString()).toBe("2026-09-20T18:29:59.999Z");
  });

  it("bounds a clinic calendar month", () => {
    const { start, end } = clinicMonthBounds(2026, 8); // September, 0-based
    expect(start.toISOString()).toBe("2026-08-31T18:30:00.000Z");
    expect(end.toISOString()).toBe("2026-09-30T18:29:59.999Z");
  });

  it("normalises an out-of-range month index, as the analytics service relies on", () => {
    const lastDec = clinicMonthBounds(2026, -1);
    expect(lastDec.start.toISOString()).toBe("2025-11-30T18:30:00.000Z"); // 1 Dec 2025 IST
  });
});

describe("formatClinicTime", () => {
  it("formats an instant as clinic wall-clock time", () => {
    expect(formatClinicTime(new Date("2026-09-15T04:30:00.000Z"))).toMatch(/10:00/);
  });

  it("formats identically under both runtimes", () => {
    const expr = `ct.formatClinicTime(new Date("2026-09-15T04:30:00.000Z"))`;
    expect(runUnderTZ("UTC", expr)).toBe(runUnderTZ("Asia/Kolkata", expr));
  });
});
