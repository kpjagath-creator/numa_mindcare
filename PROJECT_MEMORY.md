# Numa MindCare — Project Memory & Architecture (as of 2026-08-30)

> This file is a snapshot of the repo state at the moment work resumed. `context.md` (repo root) is the older hand-maintained dev-context doc — read both; this file fills in the modules `context.md` doesn't cover (analytics, availability, clinical notes, billing, dashboard) and records the latest UI/UX pass.

---

## 1. What this is

**Numa MindCare** is an internal practice-management web app for a therapy/mental-health clinic. Single clinic, no multi-tenant concept. Tracks patients through a lifecycle (intake → discovery call → active therapy → paused/completed/dropped), schedules and bills therapy sessions, manages the therapist team and their availability, and surfaces basic clinical notes and revenue analytics.

Repo: https://github.com/kpjagath-creator/numa_mindcare (cloned to `D:\NMC\numa_mindcare`)
27 commits total, first commit `ded14bf` "initial project setup", latest `39fc8fb` "chore: point production frontend at Render backend URL" (2026-08-30).

## 2. Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite 5 + TypeScript 5, react-router-dom v6, axios. No UI framework — all inline `style` objects. |
| Backend | Node.js + Express 4 + TypeScript, Prisma 5 ORM, Zod for validation |
| Database | PostgreSQL, hosted on **Supabase**. Connects via Supabase's **session pooler** (`aws-1-ap-northeast-1.pooler.supabase.com:5432`) — see §10 gotcha, this is required, not optional. |
| Frontend hosting | Vercel (rewrites `/* → /index.html`), also has a Netlify `_redirects` file for the same SPA-routing purpose |
| Backend hosting | Render (Blueprint defined in root `render.yaml`; `npx prisma migrate deploy` runs as a `preDeployCommand` before each deploy, then `node build/app.js` starts the server) |
| Local ports | backend `:3001`, frontend `:5173` (Vite proxies `/api/v1` → `:3001` in dev) |

Username/password auth + centralized permission-based RBAC is wired in on both frontend and backend — see §8a.

## 3. Repository layout

```
numa_mindcare/
├── context.md              ← older hand-maintained dev doc (session-type/discovery-call workflow deep dive)
├── PROJECT_MEMORY.md        ← this file
├── README.md
├── render.yaml               ← Render Blueprint for the backend web service (see §2)
├── .claude/launch.json      ← Windows dev-server launch config (backend :3001, frontend :5173)
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── seed.ts
│   │   └── migrations/      ← 7 migrations, from initial patient table to session_type column
│   └── src/
│       ├── app.ts
│       ├── routes/          patients, teamMembers, therapySessions, analytics, availability, clinicalNotes
│       ├── controllers/     one per route group (thin, delegates to services)
│       ├── services/        ALL business logic + Prisma calls
│       ├── validators/      Zod schemas per resource
│       ├── middleware/      errorHandler, logger
│       ├── utils/           apiResponse, responseHelper, generateCodes
│       └── lib/prisma.ts    Prisma client singleton
└── frontend/
    ├── vercel.json
    ├── public/_redirects
    └── src/
        ├── App.tsx           route table (see §6)
        ├── api/              one file per resource (axios calls)
        ├── pages/            dashboard, billing, patients, team, schedule
        ├── components/
        │   ├── layout/       Sidebar, TopBar, MobileBottomNav, Layout
        │   ├── patients/     PatientTable, PatientStatusBadge, StatusHistoryModal/Log
        │   ├── schedule/     SessionsTable, AddSessionModal, SessionActionsDropdown, ClinicalNotesPanel
        │   ├── team/         TeamTable, AvailabilityManager
        │   └── ui/           Toast, ConfirmDialog, EmptyState, SkeletonTable, SearchableSelect, Spinner, Breadcrumb
        ├── constants/        statuses.ts (patient status workflow), app.ts
        ├── hooks/            useIsMobile
        └── types/index.ts
```

## 4. Data model (Prisma, `backend/prisma/schema.prisma`)

- **Patient** — `patientNumber` (unique), name, mobile, email, age, source, referredBy, `currentStatus`, optional `therapistId` (→ TeamMember, `onDelete: SetNull`). Has `statusLogs`, `assignments`, `sessions`.
- **PatientStatusLog** — audit trail of status changes: previous/new status, who changed it, optional notes.
- **TeamMember** — `employeeCode` (unique), name, `employeeType`, `email` (nullable — required for new records at the validator layer, absent on rows predating MEET-01), `isActive`. Relations: patients they're primary therapist for, session assignments, `TherapistAvailability`, `TherapistBlockout`.
- **TherapySession** — patientId, teamMemberId, start/end time, `durationMins`, `status` (upcoming/completed/cancelled/no_show), `cancelReason`, `charges` (Decimal), `paymentStatus`, `noShowFee`, self-referential `rescheduledFromId`/`rescheduledTo` for reschedule chains, **`sessionType`** ("therapy" | "discovery", default "therapy" — the field that drives most workflow branching), `notes`, and the Google Calendar integration columns (`meetingProvider`, `googleEventId` UNIQUE — derived from the session id since MEET-02, `meetingLink`, `meetingStatus` = PENDING/ACTIVE/FAILED/CANCELLED/CANCEL_FAILED, `meetingError` — all nullable). Has many `ClinicalNote`.
- **PatientAssignment** — historical therapist assignment records (assignedAt/unassignedAt/isActive) — separate from the single `Patient.therapistId` "current therapist" pointer.
- **TherapistAvailability** — weekly recurring slots per therapist (dayOfWeek 0–6, startTime/endTime as "HH:MM" strings).
- **TherapistBlockout** — one-off blocked dates (leave/holiday) per therapist.
- **ClinicalNote** — free-form (not SOAP-structured) notes attached to a session, with `createdByName`.
- **User** — `username` (unique, login identifier), `email` (optional), `passwordHash`, `role`, `teamMemberId`, `passwordChangedAt`, `isActive`. Backs username/password auth as of 2026-08-30 — see §8a.

Migration history (`backend/prisma/migrations/`): init → add therapist-to-patient → add therapy sessions → add session status/duration → add session charges → add availability/reschedule/no-show/notes/payment → add session_type → add user auth fields → add session overlap exclusion → add clinical note sign-off → add therapist email and session meeting (MEET-01, 2026-09-01). The session_type migration is the one `context.md` documents in depth (it's the source of several "discovery vs therapy session" bugs that got fixed).

## 5. Backend API surface (`/api/v1`)

All routes below `/api/v1` except `/auth/login` require an authenticated session (see §8a); each route also declares a specific permission via `requirePermission`.

| Resource | Base path | Notes |
|---|---|---|
| Auth | `/auth` | `POST /login` (public), `POST /logout`, `GET /me`, `POST /change-password` |
| Patients | `/patients` | CRUD + `PATCH /:id/status`, `PATCH /:id/therapist`, `GET /:id/status-logs` |
| Team members | `/team-members` | CRUD-ish + `PUT /:id` (edit therapist, MEET-01), `GET /:id/patients` |
| Therapy sessions | `/therapy-sessions` | create/list/get/delete + `/:id/cancel`, `/:id/complete`, `/:id/reschedule`, `/:id/no-show`, `/:id/payment-status`, `/:id/meeting/retry` (MEET-01), `/therapist/:id` |
| Analytics | `/analytics` | `GET /dashboard`, `GET /revenue` |
| Availability | `/availability` | `PUT/GET /therapist/:id/slots`, `POST/GET /therapist/:id/blockouts`, `DELETE /blockouts/:id` |
| Clinical notes | `/clinical-notes` | `POST/GET /session/:sessionId`, `PUT/DELETE /:id` |

Controllers are thin; all logic (including the patient-status auto-advance transaction) lives in `services/*.ts`. `therapySessionsService.ts` is the most important file in the backend — see `context.md` §7 for the full breakdown of `createSession`, `completeSession`, `rescheduleSession`, and the auto-advance rules.

## 6. Frontend routes (`frontend/src/App.tsx`)

```
/                     DashboardPage       KPIs, revenue, upcoming sessions overview
/billing              BillingPage         revenue/payment-status views
/patients             PatientListPage
/patients/new         RegisterPatientPage
/patients/:id         PatientProfilePage  status workflow, sessions, clinical notes, schedule CTA
/team                 TeamListPage
/team/new             AddTeamMemberPage
/team/:id/patients    TeamMemberPatientsPage
/schedule             ScheduleListPage    desktop table / mobile cards, create/complete/cancel/reschedule
*                     → redirect to /
```
Mobile vs desktop is handled per-page (not via separate routes) using `useIsMobile` — `ScheduleListPage` and `PatientProfilePage` both render distinct mobile/desktop JSX and any new feature must be added to both.

## 7. Patient status workflow (see `frontend/src/constants/statuses.ts` + `context.md` §6 for full detail)

```
created → discovery_scheduled → discovery_completed → started_therapy → schedule_completed
                                                              ↓
                                                       therapy_paused ⇄ started_therapy
                                                              ↓                ↓
                                                       patient_dropped   patient_dropped
```
Auto-advances happen inside `therapySessionsService.ts` transactions, keyed off `TherapySession.sessionType` ("discovery" vs "therapy") — **not** off any explicit "is this a discovery booking" flag elsewhere. This is the single most important invariant in the codebase; most historical bugs (documented in `context.md` §9) came from `sessionType` not being propagated correctly (e.g. on reschedule).

## 8. Recent history / where things left off

**2026-08-30 — Railway → Render migration + production outage debugging.** Backend moved from Railway to Render (`render.yaml` added, `railway.toml` removed, port fallback changed to 3001). This surfaced a chain of three separate production issues on `numa-mindcare.vercel.app`, fixed in order:
1. `frontend/.env.production` still had the dead Railway URL → repointed to `https://numa-mindcare.onrender.com/api/v1` (commit `39fc8fb`) — but the live site kept calling the old URL until the **Vercel dashboard's own `VITE_API_URL` override** (which takes precedence over the committed file) was also updated and redeployed.
2. Backend then returned 500s: `DATABASE_URL` pointed at Supabase's **direct connection** host (`db.<ref>.supabase.co:5432`), which is **IPv6-only** — unreachable from Render (no outbound IPv6). Fixed by switching to Supabase's pooler host.
3. Still 500s after that: Supabase's **transaction-mode pooler** (port `6543`, even with `?pgbouncer=true`) doesn't reliably support Prisma's prepared statements — reused underlying connections caused "prepared statement does not exist / already exists" errors. Fixed by switching to the **session pooler** (same host, port `5432`, no `pgbouncer` param) — the correct mode for a long-running server process like this one (transaction mode is for serverless/short-lived connections).

All three were config-only fixes (Vercel env var + Render `DATABASE_URL`), no application code changed for the DB/connectivity part. See §10 for the resulting standing gotchas.

Last handful of commits (newest first):
1. `142f62d` — unify dashboard/avatar colors to a single teal (#3D9E8E) — polish pass on top of the revamp below.
2. `f8c5ec6` — **complete UI/UX revamp** across all frontend pages: new design tokens (primary `#3D9E8E`, sand background `#F7F2EC`, semantic status colors — purple=no-show, red=dropped), SVG sidebar icons replacing emoji, avatar/initials columns on patient & team tables, restyled ConfirmDialog/Toast/EmptyState/SkeletonTable/SearchableSelect, standardized input height 44px / button height 40px / card radius 16px. Touched ~30 files.
3. `3abf87c` — fixed SPA routing on Netlify via `_redirects` (suggests both Vercel and Netlify have been tried/considered for frontend hosting).
4. A run of Railway backend deploy fixes (`191cce7`, `f83de4a`, `a089fe3`, `3d6856e`) around getting `prisma migrate deploy` to run reliably on startup without blocking the server if migration fails.
5. `067000a` — `context.md` added for session bootstrapping (that file is now one release behind — doesn't mention analytics/availability/clinicalNotes/billing/dashboard modules, which already exist in the code).
6. Before that: the discovery-call workflow feature and its bug-fix chain (`031f8e4`, `877e98`, `02c8de1`, `3877e98` etc.) — fully documented in `context.md` §9.

**Working theory of current state:** functionally complete-ish MVP (patients, sessions, team, availability, clinical notes, billing/analytics) with a UI/UX visual pass finished, and authentication + RBAC now implemented, locally validated, and deployed to production (see §8a, §8b, §8c). No visible in-progress feature branch — `main` is the only branch fetched. Good candidates for "what's next": reconciling `context.md` with the newer modules (it still predates auth and several other modules), adding a second real role beyond `admin`, or picking up whatever the user intended next (ask them).

## 8a. Authentication & RBAC (added 2026-08-30)

Username/password auth + centralized permission-based RBAC, built on the previously-unused `User` model.

- **Auth:** JWT in an httpOnly cookie (`numa_session`), not localStorage — signed/verified in `backend/src/auth/jwt.ts`, 12h expiry. `SameSite=None; Secure` in production (Vercel↔Render is cross-site), `Lax`/non-secure in dev (Vite proxy makes it same-origin). `User.passwordChangedAt` invalidates old tokens on password change without needing a session table.
- **RBAC:** centralized Role→Permission map in `backend/src/auth/permissions.ts` (`resource:action` strings, e.g. `patients:create`). Routes declare `requirePermission("...")` per-endpoint; nothing checks `role === "admin"` directly. Add a role by adding a key to `ROLE_PERMISSIONS` there — no other file needs to change.
- **Middleware:** `requireAuth` (backend/src/middleware/requireAuth.ts) runs globally on `/api/v1/*` except `/auth/login`; `requirePermission` runs per-route on top of it.
- **Bootstrap admin:** `username: admin`, seeded by `backend/prisma/seed.ts` (skips if already exists — never overwrites a changed password). Locked-out recovery: `npm run reset-admin-password` (backend/src/scripts/resetAdminPassword.ts) — no HTTP reset endpoint exists.
- **Frontend:** `frontend/src/auth/AuthContext.tsx` (calls `/auth/me` on load), `ProtectedRoute` component wraps every route in `App.tsx` except `/login`, permission-aware hiding on the primary "create" buttons (Patients/Team/Schedule) via `hasPermission()`.
- **New required env var:** `JWT_SECRET` (backend/.env, and Render dashboard for production — `render.yaml` declares it `sync: false`). Also `FRONTEND_URL` for CORS (comma-separated if multiple origins).
- **Schema change:** `User` gained `username` (unique, login identifier) and `passwordChangedAt`; `email` became optional. Migration: `20260830000000_add_user_auth_fields` — hand-written, includes a guard that aborts loudly instead of corrupting data if `users` is ever non-empty when applied.

## 8b. Production deployment (2026-08-30)

Auth + RBAC deployed to production. Live URLs: frontend `https://numa-mindcare.vercel.app`, backend `https://numa-mindcare.onrender.com`. All 7 mandatory smoke tests passed (login page, admin login, refresh persistence, patient data load, logout + direct-URL redirect, invalid-login generic message, bootstrap password changed and old password rejected).

**Standing limitation — `render.yaml`'s `preDeployCommand` does not run on Render's Free plan.** `npx prisma migrate deploy` is declared there but Free-tier services silently skip it (Pre-Deploy Command, Web Shell, and One-Off Jobs are all Starter-plan-or-above features — confirmed directly in the Render dashboard, both gated behind the same upgrade prompt). This means **every future schema migration must be applied manually** by running `prisma migrate deploy` from a local machine against the production `DATABASE_URL` (copy it from Render dashboard → Environment → reveal `DATABASE_URL`) before/after pushing the migration — it will not happen automatically. Upgrading to Render's Starter plan would fix this properly.

**Also found during this deployment (config-only, not app bugs):**
- Render env var `NODE_ENV=production` makes `npm install` skip devDependencies during the *build* step too (not just at runtime), which broke `tsc` (`@types/express`/`@types/node` missing). Fixed by changing the build command to `npm install --include=dev && npx prisma generate && npm run build` (both in `render.yaml` and the service's dashboard Settings — the dashboard value doesn't auto-resync from `render.yaml` on every push, so if `render.yaml`'s build/start commands ever change again, update the dashboard Settings too or confirm this service is properly Blueprint-synced).
- Seeding the bootstrap admin must NOT be done by running the full `prisma/seed.ts` in production — it also creates 10 demo team members/patients/sessions. Bootstrap-only admin creation was done with a small temporary script (not committed) that duplicated just the idempotent admin-create block from `seed.ts`.

## 8c. Cross-site session cookie fix (2026-08-30)

**Bug:** admin login in Chrome Incognito (and any browser blocking third-party cookies — Safari default, Brave default, Firefox strict mode) appeared to succeed, then immediately bounced back to `/login` on the first authenticated request. Reproduced by a clean, cookie-fresh browser session that made a direct `fetch` to `onrender.com` — the session cookie set by the login response was never sent back on subsequent requests. Root cause: frontend (`numa-mindcare.vercel.app`) and backend (`numa-mindcare.onrender.com`) are different domains, so the session cookie (`SameSite=None; Secure`) is a cross-site/third-party cookie from the browser's point of view. Third-party cookie blocking (on by default in Incognito, Safari, Brave, Firefox strict) drops it regardless of `SameSite=None`.

**Fix:** proxy `/api/*` through Vercel so the browser only ever talks to `numa-mindcare.vercel.app` — the cookie becomes first-party and is no longer subject to third-party blocking.
- `frontend/vercel.json`: added `{ "source": "/api/(.*)", "destination": "https://numa-mindcare.onrender.com/api/$1" }` as a rewrite *before* the SPA catch-all rewrite. Vercel proxies this transparently (including `Set-Cookie` and request cookies) — this is a supported "external rewrite," not a redirect.
- `frontend/.env.production`: `VITE_API_URL` changed from the absolute `https://numa-mindcare.onrender.com/api/v1` to the relative `/api/v1`.
- **Also had to update the Vercel dashboard's `VITE_API_URL` env var to `/api/v1`** — same gotcha as always: the dashboard value overrides the committed `.env.production` at build time and does not auto-sync from the repo.
- Verified post-deploy with a fresh, cookie-empty browser context: `fetch('/api/v1/auth/login', ...)` and `fetch('/api/v1/auth/me', ...)` both resolved at `numa-mindcare.vercel.app` (not `onrender.com`), and a full page reload after login rendered the dashboard directly with no redirect loop.
- Backend `cors()`/cookie config (`backend/src/app.ts`, `backend/src/auth/cookies.ts`) was left unchanged — still correct as a fallback for any direct (non-proxied) call to the backend, and harmless now that the cookie is first-party via the proxy path.

## 8d. Patient Lifecycle capability — backend boundary refactor (2026-08-30)

**What changed.** Introduced `backend/src/services/patientLifecycleService.ts` with a single
exported function, `transitionPatientStatus(tx, patientId, toStatus, changedByName, notes?)`,
that centralizes Patient lifecycle transitions: validating whether `fromStatus → toStatus` is a
legal transition (against one `VALID_TRANSITIONS` map covering both manual and automatic edges),
updating `Patient.currentStatus`, and creating the `PatientStatusLog` row. It always requires an
existing Prisma transaction client from the caller and never opens its own.

- `patientsService.updatePatientStatus` (manual, staff-initiated transitions from the patient
  profile) now wraps a call to `transitionPatientStatus` in its own `prisma.$transaction`, instead
  of updating `Patient`/`PatientStatusLog` inline.
- `therapySessionsService.createSession` and `.completeSession` (automatic, session-event-driven
  transitions) now call `transitionPatientStatus(tx, ...)` with the same `tx` the session write
  itself uses, instead of writing `Patient`/`PatientStatusLog` directly inline. The
  `sessionType`/current-status precondition checks that gate *whether* an automatic transition is
  even attempted (e.g. "only advance `created → discovery_scheduled` if scheduling a discovery
  call") stayed in `therapySessionsService.ts`, unchanged — Scheduling still decides *when*;
  Patient Lifecycle now owns *whether it's legal* plus the mutation and audit log.

**Why.** This was the top-priority seam flagged in `ARCHITECTURE.md` §5/§11/§14 (step 1 of its
evolution sequence): `therapySessionsService.ts` was writing directly into `Patient`/
`PatientStatusLog`, tables it doesn't own, duplicating lifecycle-transition logic that also lived
independently in `patientsService.ts` with no shared entry point and no transition-legality
validation at all on the manual path.

**Architectural rationale.** Scheduling now calls a Patients-owned public operation instead of
reaching into Patients' tables directly — the one sanctioned cross-service import in the codebase
(see `ARCHITECTURE.md` §2). The capability lives inside the existing `services/*.ts` convention
(no new module/folder), and accepts the caller's `tx` rather than opening its own, so the existing
atomicity guarantees are unchanged: session create/complete + lifecycle transition + audit log
remain one transaction, exactly as before.

**Behavior change (in-scope, not incidental):** before this change, `PATCH /patients/:id/status`
performed no transition-legality check — it accepted any `PatientStatus` enum value regardless of
the patient's current status. It now rejects an illegal transition with `409 Conflict`. This is
the explicit point of centralizing validation (SPEC.md §3's lifecycle diagram) and brings the
backend in line with what the frontend's `STATUS_TRANSITIONS` map already restricted via the UI —
flagged here as the one externally observable behavior change from this refactor, not a
regression.

**Tests added.** The repo previously had zero automated tests (`ARCHITECTURE.md` §11). Added
`vitest` as a dev dependency (`npm test` in `backend/`) and
`backend/src/services/__tests__/{patientLifecycleService,patientsService,therapySessionsService}.test.ts`,
covering: every valid manual/automatic transition, representative invalid transitions, the
precondition gate on automatic transitions (no advance when current status doesn't match),
`PatientStatusLog` audit content, `sessionType` preservation on reschedule, and that a mid-
transaction failure rolls back both the session and the patient-status change. Since there's no
test database wired up, `backend/src/services/__tests__/fakePrisma.ts` is a small in-memory
double for the Prisma operations these services call (including `$transaction` with snapshot/
restore rollback semantics) — not a full Prisma reimplementation, and not a substitute for
real integration tests against Postgres if a test database is set up later.

**Implementation locations:**
- `backend/src/services/patientLifecycleService.ts` (new)
- `backend/src/services/patientsService.ts` (`updatePatientStatus` simplified to delegate)
- `backend/src/services/therapySessionsService.ts` (`createSession`/`completeSession` delegate)
- `backend/src/services/__tests__/` (new — `fakePrisma.ts`, three `*.test.ts` files)
- `backend/package.json` (`vitest` dev dependency, `test` script)

**Caveats / remaining risk.** No API contract, endpoint structure, frontend, payment behavior, or
scheduling-conflict logic changed. `sessionType` propagation on `rescheduleSession` was verified
unchanged (still explicit, still copied from the original) and is now covered by a test. The
known concurrency risk in scheduling-conflict detection (`ARCHITECTURE.md` §7/§11) is untouched by
this change and remains open.

**Post-implementation correction (2026-08-30): concurrency-safe transition write.** A follow-up
review of this same commit found that `transitionPatientStatus`'s original write was a plain
`patient.update({ where: { id } })` — unconditional on the status it had just validated against.
Under Postgres's Read Committed isolation, two concurrent conflicting transitions from the same
starting status (e.g. `started_therapy → therapy_paused` and `started_therapy → patient_dropped`
firing at the same time) could both pass validation against their own stale read, and the second
writer — once unblocked by the first writer's commit — would re-evaluate its `id`-only `WHERE`
clause against the *new* row and blindly overwrite it, producing a non-deterministic final status
plus two `PatientStatusLog` rows that both claim `previousStatus: "started_therapy"` even though
only one of them was still true. Being inside a `$transaction` did not prevent this, since the
transaction only guaranteed atomicity of the write, not correctness of the check-then-act sequence
across concurrent transactions.

**Fix.** The update is now a conditional (compare-and-swap) `patient.updateMany({ where: { id,
currentStatus: fromStatus }, data: { currentStatus: toStatus } })`. If `count === 0`, another
transition already changed the row since the read — the current status is re-fetched and the
transition is rejected as invalid (`409`), rather than silently overwritten. No locking
infrastructure, event system, or CQRS was introduced; the fix is expressed entirely through
Prisma's existing query API, and the `patientLifecycleService.ts` → `patientsService.ts` /
`therapySessionsService.ts` transaction boundary is unchanged. A focused test in
`patientLifecycleService.test.ts` fires two conflicting transitions concurrently via
`Promise.allSettled` and asserts exactly one succeeds, the other gets `409`, and exactly one
`PatientStatusLog` row is written — this proves the compare-and-swap contract holds against the
fake Prisma double, not Postgres's actual row-locking/MVCC behavior, which is relied on as
documented rather than re-tested here.

## 8e. Priority capabilities 1–4: concurrency-safe booking, availability-aware scheduling, clinical note sign-off, patient timeline (2026-08-30)

**What changed.** Implemented four approved capabilities in one pass, evaluated up front per the
task's mandatory gate (classification: **PROCEED WITH MODIFICATIONS** — one genuine product-policy
question on SCH-13 was escalated to the user before implementation; user chose to defer SCH-13
entirely rather than pick a buffer value).

**1. SCH-05 — concurrency-safe session booking.** The existing `findFirst` overlap check in
`createSession`/`rescheduleSession` was a real check-then-act race under Postgres `READ
COMMITTED` (documented as a known risk in `ARCHITECTURE.md` §7/§11 before this work). Fixed with
two partial Postgres `EXCLUDE` constraints on `therapy_sessions` — `(patient_id, tsrange(start,
end))` and `(team_member_id, tsrange(start, end))`, scoped to non-cancelled/rescheduled/no-show
statuses (migration `20260830094335_add_session_overlap_exclusion`, requires `btree_gist`). The
service layer catches the resulting `23P01` exclusion-violation and maps it to the same 409
conflict shape the `findFirst` path already returns. No locking infrastructure, event system, or
CQRS — a database constraint is the smallest mechanism that actually closes the race. Verified with
genuine concurrent `Promise.allSettled` requests against a real local Postgres database (see 8e-i
below), not just mocked.

**Bug surfaced by the constraint, fixed in the same change:** `completeSession` unconditionally set
`endTime: new Date()`. Completing a session dated in the future (e.g. a backdated/early completion)
could produce `endTime < startTime` — previously a silent data-integrity gap, now a hard Postgres
error (`22000 range lower bound must be less than or equal to range upper bound`) once the
EXCLUDE constraint's `tsrange(start_time, end_time)` is evaluated on every write. Fixed by clamping:
`endTime = now < session.startTime ? session.startTime : now`.

**2. Availability-aware scheduling — SCH-04 (availability) + SCH-20 (blackouts); SCH-13 (buffer)
deferred.** `TherapistAvailability`/`TherapistBlockout` existed with full CRUD but were never read
during booking. Added `assertTherapistAvailable` in `therapySessionsService.ts`, checked in both
`createSession` and `rescheduleSession` inside the same transaction as conflict detection: therapist
must be `isActive`, the full session range must fit inside a weekly `TherapistAvailability` window
for that day (boundary-inclusive; a session spanning past midnight is rejected outright since it
can never fit one weekday's window), and the date must not have a `TherapistBlockout`. SCH-13 (a
configurable minimum buffer between sessions) was explicitly **not implemented** — there was no
existing buffer concept anywhere in the schema/code, and picking a default value (global vs.
per-therapist, what number) is a genuine product-policy decision; escalated to the user via
`AskUserQuestion`, who chose to skip it for this pass rather than invent a default. Frontend:
`AddSessionModal.tsx` fetches the selected therapist's availability/blockouts and shows a live
"available" / "not available" / "blocked" indicator — informational only; the backend independently
re-validates on submit and is the sole source of truth (verified live: submitting into an
unavailable slot returns the backend's own 409 message, not just a client-side block).

**Operational note:** because this newly enforces "no availability configured → cannot be booked,"
existing therapists in the seeded/production data with no `TherapistAvailability` rows will be
unbookable until staff configures their weekly availability via the existing Team page UI. This is
the intended, explicitly-requested behavior (SCH-04 says booking requires availability to exist),
not a bug — flagged here so it isn't mistaken for a regression after deploy.

**3. CLN-07 — clinical note sign-off / immutability.** `ClinicalNote` gained `status` ("draft" |
"signed"), `signedAt`, `signedByName`; a new `ClinicalNoteAmendment` model (append-only, FK to
`ClinicalNote`) holds post-signature follow-ups. `signNote` is a compare-and-swap transition
(`updateMany({ where: { id, status: "draft" } })`) — the same pattern
`patientLifecycleService.transitionPatientStatus` already established for this codebase — so two
concurrent sign attempts on the same note can't both "win" (verified with a real concurrent test:
exactly one succeeds, one gets 409, exactly one signature persists). `updateNote`/`deleteNote`
reject a signed note with 409. `addAmendment` requires `status: "signed"` and never touches the
original row. New `clinical_notes:sign` permission added to the centralized RBAC map (`admin` has
it, same as every other permission today) — no scattered role checks. Frontend
(`ClinicalNotesPanel.tsx`): draft notes show Edit/Sign; signing requires an explicit confirm step
("locks this note permanently…"); signed notes render read-only with a signed badge, signer, and
timestamp, plus an amendment list and add-amendment form gated on `clinical_notes:update`.

**4. PAT-10 — staff patient timeline.** No new event table. `patientTimelineService.ts` (Patients
domain, `GET /patients/:id/timeline`) runs three parallel bounded queries — `PatientStatusLog`,
`TherapySession`, `ClinicalNote` (joined via `session.patientId`) — and composes them into one
typed, chronologically sorted list (lifecycle / assignment / payment / session / clinical_note),
with a fixed type-priority tie-break for identical timestamps so ordering is deterministic and
reproducible across calls (covered by a dedicated test). `PatientStatusLog` is overloaded in this
codebase (also used for `therapist_updated` and `payment_<status>` pseudo-transitions) — the
timeline classifies those into their own `assignment`/`payment` entry types rather than showing them
as lifecycle changes. Rendered as a new `PatientTimeline` component inside a `CollapsibleCard` on
`PatientProfilePage.tsx`, added identically to both the mobile and desktop JSX branches (per
CLAUDE.md rule #2). This is a strict performance improvement over the page's pre-existing behavior,
not just "no worse": `PatientProfilePage.tsx` was already doing a real N+1 (one `getNotesForSession`
call per session, sequentially awaited in a `for` loop, to build the existing "Clinical Notes"
summary/count) — left untouched (out of scope, not redesigning the whole profile page), but the new
Timeline data comes from one additional bounded request, not a loop.

**8e-i. A real local test database now exists and is used.** `backend/.env`'s `DATABASE_URL`
already pointed at a local Postgres (`numa_test`) with migrations applied — undocumented before this
work. `ARCHITECTURE.md` previously stated flatly that "the repo has no test database wired up"; that
was true of the *committed* test suite (which only ever exercised a fake Prisma double) but not of
the actual local dev environment. Added `backend/src/services/__tests__/*.integration.test.ts`
(therapy sessions, clinical notes, patient timeline) that run real queries — including genuine
concurrent `Promise.allSettled` races — against this database, skipping gracefully via Vitest's
`ctx.skip()` if it isn't reachable rather than failing the whole suite. `vitest.config.ts` now sets
`fileParallelism: false` since these files share tables and were racing each other when run in
parallel. This is now the strongest deterministic coverage practical for the concurrency invariants
in Capabilities 1 and 3 — see CLAUDE.md rule #10.

**Files changed:** `backend/prisma/schema.prisma` + 2 new migrations; `backend/src/services/{therapySessionsService,clinicalNotesService,patientTimelineService,patientsService*}.ts`
(*only wiring the new route, no logic change); `backend/src/{controllers,routes,validators}/{therapySessions,clinicalNotes,patients}*`;
`backend/src/auth/permissions.ts`; `backend/src/types/index.ts`; `backend/vitest.config.ts`; 6 new/updated test files;
`frontend/src/components/schedule/{AddSessionModal,ClinicalNotesPanel}.tsx`; `frontend/src/components/patients/PatientTimeline.tsx` (new);
`frontend/src/pages/patients/PatientProfilePage.tsx`; `frontend/src/api/{clinicalNotes,patients,availability}.ts`; `.claude/launch.json` (both copies — fixed
stale paths/backend port so `preview_start` actually works in this checkout, unrelated to the four capabilities but discovered while manually verifying them in-browser).

**Manually verified in-browser** (not just automated tests): logged in as seeded admin, created and
signed a clinical note with an amendment, confirmed the Timeline picked up the new events, attempted
to book an unavailable therapist and got the backend's own rejection message, configured availability
via a direct API call and confirmed the same booking then succeeded.

## 8f. Google Meet session integration & automatic calendar invitations (MEET-01) (2026-09-01)

**What changed.** Scheduling a session now also creates a Google Calendar event with a Google
Meet conference on a dedicated Numa Google account, invites the patient and assigned therapist,
and stores the resulting Meet link against the session. Admins can copy the link and retry a
failed generation. Therapist email became mandatory on new onboarding, and a therapist edit
capability was added because none existed.

Evaluated up front per the task's mandatory gate. Classification: **PROCEED WITH MODIFICATIONS**
— three material gaps between the proposed design and the actual repository/Google API were
reported before any code was written; the user approved two and cut the third from scope.

### Why the design had to change (the evaluation findings)

1. **There was no therapist edit flow at all.** The task said to "add email to the existing
   therapist edit flow". No such flow existed: no `PUT`/`PATCH` route, no `team:update`
   permission, no update service function or validator, no edit UI anywhere in the frontend. The
   whole edit capability had to be built, mirroring `PUT /patients/:id` → `updatePatientInfo`.
2. **A service account cannot do this integration.** Creating a `hangoutsMeet` conference and
   having Google deliver attendee invitations both require acting *as* a user, which requires
   domain-wide delegation, which requires Google Workspace. The dedicated Numa account is a
   consumer Gmail account, so OAuth 2.0 with a stored refresh token is the only viable mechanism
   — not a preference, a constraint. **The 7-day trap:** while the Cloud Console OAuth app sits
   in "Testing" publishing status, Google expires refresh tokens after 7 days; the integration
   would work for a week and then fail silently with `invalid_grant`. The app must be published
   to "In production" (full verification is *not* needed for one account — an unverified
   production app shows a one-time interstitial and issues non-expiring tokens). This is a
   deployment prerequisite outside the codebase and is now CLAUDE.md rule #11.
3. **Calendar API v3 has no resend operation.** `sendUpdates=all` only emails attendees when the
   event actually changes, so "resend invitation" would have required removing and re-adding the
   attendee across two patched writes. Reported as a limitation; **the user cut invitation
   resend from scope entirely** rather than accept the workaround. Google sends the initial
   invitation at event creation and that is the whole of the invitation behaviour.

### Architecture

Dependency chain, strictly one-directional:

```
therapySessionsService  →  sessionMeetingService  →  googleCalendarService  →  Google
   (scheduling rules)       (integration policy)        (HTTP surface only)
```

`therapySessionsService` contains no Google-specific logic — it calls three total functions.
`googleCalendarService` contains no Numa business logic and touches no Prisma.

**Two invariants drove every design decision:**

- **No Google call inside a transaction.** `createSession`/`rescheduleSession` write
  `meetingStatus: "PENDING"` *inside* the transaction (a local column write, not a network call)
  and invoke the integration only after commit. An HTTP round-trip inside a transaction would
  hold a database connection open for its duration, and — far worse — would make the existence
  of a therapy session contingent on Google being reachable.
- **Google failure never invalidates a Numa session.** Every entry point in
  `sessionMeetingService` is *total*: it records a `FAILED` state and resolves rather than
  throwing. `attachMeeting` in `therapySessionsService` wraps each call as a second belt, so even
  an unexpected throw cannot surface to an admin as a failed booking. The same holds for
  cancellation: a Google cancellation failure leaves the Numa session cancelled and records
  `meetingError` as the recoverable "cancellation pending" state.

**Reschedule chose Option B (cancel old event, create new)** — dictated by the existing domain
model, not preference. `rescheduleSession` marks the original `rescheduled` and creates a *new*
session row; both persist as real, queryable records. Updating one Google event in place would
leave two Numa sessions pointing at one event and break the 1:1 mapping that cancellation and
retry idempotency depend on. The two Google calls are ordered cancel-then-provision so a failure
to create the new event can never leave two live appointments on attendees' calendars.

**Duplicate prevention, three layers** (no locks, no queue, no new infrastructure):
1. `provisionSessionMeeting` returns early if `googleEventId` is already set.
2. The write-back is a compare-and-swap (`updateMany` on `{ id, googleEventId: null }`); the
   loser of a race **deletes the event it just created** rather than orphaning a duplicate
   appointment on real people's calendars.
3. `therapy_sessions.google_event_id` has a `UNIQUE` index as the database-level backstop.

> **Corrected 2026-09-01 (MEET-02):** the original entry also claimed a stable per-session
> conference `requestId` stopped a retried create from forking a second conference. That was
> wrong — `conferenceData.createRequest.requestId` only dedupes conference creation *within one
> event*; two `events.insert` calls produce two events regardless. The layers above also only
> guaranteed at most one event **in the database**, not on Google. See §8g for what actually
> closes this.

### Schema (migration `20260831120000_add_therapist_email_and_session_meeting`)

- `team_members.email TEXT` — **nullable on purpose.** Records predating this feature have no
  email; a `NOT NULL` column would have failed the migration on existing rows and locked those
  therapists out of every update path. Required-on-create lives in the Zod validator, not the
  column. This asymmetry is the whole reason the edit capability exists.
- `therapy_sessions`: `meeting_provider`, `google_event_id` (UNIQUE), `meeting_link`,
  `meeting_status`, `meeting_error` — all nullable; null means no meeting was ever attempted.

Migration was applied to the local `numa_test` database only. **Per CLAUDE.md rule #5, Render's
free plan does not run `preDeployCommand` — this migration must be applied manually against
production with `prisma migrate deploy` before/after the deploy.**

### Privacy

The calendar event title is `Therapy Session — Numa MindCare` or `Discovery Call — Numa MindCare`
and nothing else. No patient name, no diagnosis, no clinical notes, no charges, no session notes
leave Numa. Attendees cannot see each other's contact details or modify the event
(`guestsCanSeeOtherGuests: false`, `guestsCanModify: false`). Tokens, secrets, and attendee email
addresses are never logged — the integration logs a session id and an outcome only.

### Lessons / gotchas for future work

- **`sessionType` invariant survived intact.** `rescheduleSession` still copies
  `sessionType: original.sessionType` explicitly (CLAUDE.md rule #1) — verified by an existing
  test and re-verified live during this change.
- **Local dev without Google env vars is a supported, exercised path**, not a broken one:
  sessions schedule normally and land on `FAILED` with a "not configured" error. That is exactly
  what the Retry UI is for, and it is what the test suite runs against.
- `PENDING` is rare because provisioning is synchronous within the request, and no loading state
  was added for it. **Corrected 2026-09-01 (MEET-02):** calling it "effectively invisible" was
  wrong — it is reachable, and because the UI rendered it as a bare dash with no Retry it was a
  dead end for the admin. It now offers a Retry like any other non-terminal state.
- **Beware perl one-liners for TypeScript edits.** Several `${id}` template-literal
  interpolations were silently eaten during this change (perl read them as variables), producing
  a `PUT /team-members/` with no id that only surfaced during browser verification. Typecheck did
  not catch it — a template literal with a missing interpolation is still valid TypeScript.
  Verify generated URLs in the browser, or use exact-string editing for code.

### Files (backend)

- `services/googleCalendarService.ts` (new) — OAuth refresh + Calendar v3 over `fetch`.
- `services/sessionMeetingService.ts` (new) — integration policy, idempotency, state.
- `services/therapySessionsService.ts` — `attachMeeting` seam; post-commit hooks on create /
  reschedule / cancel / delete; new `retryMeeting`; meeting fields in `mapSession`.
- `services/teamMembersService.ts` — `updateTeamMember` (new), email on create.
- `auth/permissions.ts` — `team:update`.
- `routes/teamMembers.ts` (`PUT /:id`), `routes/therapySessions.ts`
  (`POST /:id/meeting/retry`), matching controllers, `validators/teamMemberValidators.ts`.
- `package.json` — `engines.node >= 20` (global `fetch`).

### Files (frontend)

- `components/schedule/SessionMeetingCell.tsx` (new) — one component for all meeting states,
  used by **both** the desktop table and the mobile card (CLAUDE.md rule #2).
- `components/team/EditTeamMemberModal.tsx` (new) — shared by both team-list branches.
- `SessionsTable.tsx` (Google Meet column), `ScheduleListPage.tsx` (mobile Meet block + retry
  handler), `PatientProfilePage.tsx` (retry handler wired into both branches),
  `TeamTable.tsx` (Email column + Edit), `TeamListPage.tsx`, `AddTeamMemberPage.tsx` (email
  field), API clients and types.

### Tests

Suite grew 47 → 87, all passing. `sessionMeetingService.test.ts` (16) mocks the Google client at
the module boundary — **no test in this repo makes a real Google API call.** Covers event
creation, link persistence, attendee assembly with missing emails, failure recording, retry,
compare-and-swap race loss, and cancellation failure. `therapySessionsService.test.ts` gained a
MEET-01 block proving the session survives (and the patient lifecycle still advances) when the
integration fails or throws. `teamMembersService.integration.test.ts` (7, real Postgres) proves
the nullable-email behaviour an in-memory double cannot. `teamMemberValidators.test.ts` (10)
covers required-on-create vs optional-on-edit.

## 8g. Google Calendar lifecycle recovery — deterministic event identity (MEET-02) (2026-09-01)

**Why this exists.** An independent post-implementation review of `63ced69` classified the Google
integration **MATERIAL ISSUE — DO NOT ACCEPT YET**. The happy path, the service boundary, the
transaction boundary and the privacy handling were all sound; the *cleanup* half of the lifecycle
was not. Three paths could each permanently strand a live calendar event on a patient's calendar.

**One root cause behind all of them:** `therapy_sessions.google_event_id` was the *only* record
that an external event existed. Every path that cleared or deleted that row while the event was
live lost it forever — and none of those paths checked whether the cleanup had actually worked.
That matters most during the documented 7-day refresh-token expiry, when *every* Google call
fails at once, so these were not exotic corners.

### The fix: derive the event id from the session id

`googleCalendarService.buildEventId(sessionId)` → `numasession<id>`, passed as the client-specified
`id` on `events.insert`.

Format is dictated by Google, not chosen: ids must use the **base32hex alphabet — lowercase `a`–`v`
and digits `0`–`9`, length 5–1024, unique per calendar**. That excludes hyphens and `w`–`z`, so the
obvious-looking `numa-session-123` is rejected with a 400. `numasession` uses only `a`–`v` and the
session id contributes only digits, so the result is always valid; the shortest possible value is
12 characters.

A duplicate id returns **409 "The requested identifier already exists"** — Google creates nothing
and sends nothing. The client treats that as the re-adopt signal, fetches the event with
`events.get`, and returns it with `adopted: true`. An id belonging to a *cancelled* event is not
re-adopted (Google keeps cancelled ids reserved, so it could never be re-inserted); that surfaces
as an error rather than an infinite retry loop.

**Honest limit, now documented rather than glossed:** Google states it "cannot guarantee that ID
collisions will be detected at event creation time". This is a strong safeguard, not an absolute
one. The docs no longer claim retry "never" creates a second event.

### What each failure path does now

| Path | Before | After |
|---|---|---|
| M3 — event created, database write-back fails | Event orphaned, id lost, retry created a **second** event | Retry collides on the deterministic id, re-adopts the existing event, persists it. No second invitation. |
| M1 — hard delete while cancellation fails | Row deleted anyway; event live forever with nothing to cancel it from | `deleteSession` inspects the result and **rejects with 409**; the row (and the id) survive |
| M2 — reschedule, old event cancellation fails | Old session stayed `ACTIVE`, looked healthy, retry was a no-op | Moves to `CANCEL_FAILED`, event id retained, warning + "Retry Cancellation" shown, retry re-attempts the cancel |
| M4 — `PENDING` with no link | Bare dash, no recovery from the UI | "Meeting setup pending" + Retry |

### Design decisions worth remembering

- **`CANCEL_FAILED` is a new status, and it earns its place.** Reusing `FAILED` would have worked
  functionally (the retry could discriminate on `googleEventId` presence), but staff would see
  "Unable to generate meeting" on a session that *has* a meeting needing removal. No migration was
  needed — `meeting_status` is a plain `String?` column, not a Postgres enum.
- **One retry endpoint, two jobs.** `POST /:id/meeting/retry` was kept as-is;
  `retrySessionMeeting` branches on the session's own meeting state — `CANCEL_FAILED` retries
  cancellation, anything else retries provisioning. Provisioning never runs for a `CANCEL_FAILED`
  session, so retrying cleanup can't mint a replacement event for a session that was rescheduled
  away. No new endpoint, no new API contract.
- **The compare-and-swap loser must no longer delete its event.** This is the subtle one. Before
  MEET-02 the loser had created a *different* event and deleting it was correct. Now both racers
  converge on the *same* deterministic id, so deleting it would cancel the real meeting the winner
  just recorded. It now only discards an event whose id differs from the stored one — which can
  only happen against a session provisioned before MEET-02 with a random Google-assigned id.
- **Delete is the one place Google blocks a Numa operation** — and it blocks a *destructive* one,
  which is the conservative direction. It does not weaken the scheduling invariant, which protects
  sessions being *created*. Refusal also applies when the cancellation attempt itself errored: an
  unknown event state is not a safe basis for a permanent delete.
- **Speculative cleanup on cancel/delete.** A row with no stored id but a non-null meeting status
  may still have a live event (the M3 window). Cancellation therefore targets the deterministic id
  in that case; `cancelEvent` treats 404/410 as success, so it costs one call and is safe when no
  event exists. Skipped entirely when Google isn't configured, since nothing could have been
  created.

### Backward compatibility

No migration. Sessions provisioned by `63ced69` keep their random Google-assigned ids: gate #1 in
`provisionSessionMeeting` returns before any insert when `googleEventId` is set, so those events
are never re-inserted or replaced. Deterministic identity only applies where no id was ever
persisted.

### Documentation claims corrected

The review found five claims the code did not support. All were fixed rather than restated:
"total by contract — never throws" (Prisma calls can throw; `attachMeeting` is what holds the
invariant), "one session maps to at most one Google event" (was true of the database only),
`requestId` preventing duplicate events (it does not), retry "never creates a second event"
(strong, not absolute), and cancellation being "recoverable" when no working retry path existed.

### Known, explicitly deferred

Out of scope by agreement and still open: M5 (conference `createRequest.status` is not polled, so
an `ACTIVE` row with a null Meet link is still a dead end), M7 (no request timeout on the Google
`fetch`, so a hanging call delays the booking response), M8 (the cached access token isn't
invalidated on a 401).

**Separate production-readiness blocker — timezone.** Verified read-only during this change and
**confirmed**: `createSession` parses `new Date(\`${date}T${time}:00\`)` with no offset, i.e. in the
*server's* local timezone, and `render.yaml` sets no `TZ` (Render containers are UTC). A "10:00"
booking therefore becomes 10:00 UTC = 15:30 IST. This predates the Google work and already affects
the database and the existing UI, but the integration now puts that wrong wall-clock time in front
of patients in a calendar invitation. `GOOGLE_CALENDAR_TIMEZONE` does *not* mitigate it — the
payload sends `dateTime` as an explicit UTC instant, so Google uses the offset and the `timeZone`
field is inert. **Do not enable the integration in production until this is resolved.**

## 8h. Scheduling timezone correctness — the clinic-time boundary (TZ-01) (2026-09-01)

**Why this exists.** The MEET-02 review flagged one remaining production blocker before real
calendar invitations could be enabled: session times were interpreted in the *server's* timezone.
Phase 1 (this change) fixes forward scheduling. Phase 2 — correcting existing production rows —
is deliberately separate and not started.

### The bug, precisely

`createSession`/`rescheduleSession` did:

```ts
new Date(`${session_date}T${start_time}:00`)   // no offset → parsed in the SERVER's timezone
```

`render.yaml` set no `TZ` and Render containers default to UTC, so a 10:00 booking became
`10:00Z`. Proven empirically against a real Postgres round-trip:

```
TZ=UTC            stored "2026-09-15 10:00:00"   read back 2026-09-15T10:00:00.000Z
TZ=Asia/Kolkata   stored "2026-09-15 04:30:00"   read back 2026-09-15T04:30:00.000Z
```

Read-back is clean and TZ-independent — the *write* was the problem. Consequences: an IST browser
already displayed a 10:00 booking as **15:30**, and a Google invitation would have told the patient
3:30 PM.

### The data model (worth knowing before touching any of this)

The schema mixes two time models, which is why one line was never going to be the fix:

| Store | Type | Meaning |
|---|---|---|
| `therapy_sessions.start_time`/`end_time` | `TIMESTAMP(3)` | absolute instant, round-tripped by Prisma as UTC |
| `therapist_availability.start_time`/`end_time` | `TEXT` ("09:00") | clinic wall clock, no timezone |
| `therapist_blockouts.block_date` | `TIMESTAMP(3)` | date key pinned to UTC midnight |

`assertTherapistAvailable` is the bridge between the first two, and it used `getDay()`/
`getHours()` — server-local. That *happened* to agree with the old server-local parsing, so it
worked by accident. **Fixing only the parse would have broken availability validation**: on Render
a 10:00 IST session becomes 04:30Z, `getHours()` returns 4, and a 09:00–18:00 window would have
rejected a perfectly valid booking. Same class of problem in the date filters, the conflict
messages, and the analytics buckets. That is why this change is broad rather than one line.

`therapist_blockouts` needed no change — already UTC-pinned on both write and read.

### What was built

`backend/src/lib/clinicTime.ts` — the single conversion boundary. `frontend/src/lib/clinicTime.ts`
mirrors it for display. **No dependency added:** `Intl.DateTimeFormat` with an IANA `timeZone`
does the whole job in ~30 lines, DST-aware, and Node ≥20 ships full ICU. Luxon/date-fns-tz were
rejected on the same grounds as `googleapis` — the platform already does this.

Call sites converted: parse ×2, availability (weekday + HH:MM + midnight-crossing), date filters
×2, conflict messages ×4, analytics day/week/month bounds, and every date/time render in the
frontend (13 files).

`GOOGLE_CALENDAR_TIMEZONE` now defaults to `CLINIC_TIME_ZONE` rather than carrying its own literal
— two timezone settings that can silently disagree is a trap.

### Two rules that must not be broken

1. Never build a session instant from a bare datetime string — `new Date("2026-09-15T10:00:00")`
   is server-local.
2. Never read a session instant with `getHours()`/`getDay()`/`getFullYear()`/`toDateString()`/
   bare `toLocaleTimeString()` — all server- or browser-local.

Setting `TZ=Asia/Kolkata` on the host is fine operationally but is **never** the correctness
mechanism: local, CI, and dev environments would still disagree.

### Verified

Same input, both runtimes, end to end through the real service and database:

```
15 Sep 2026, 10:00 clinic time
  TZ=UTC          → 2026-09-15T04:30:00.000Z   stored "2026-09-15 04:30:00"   displays "10:00 am"
  TZ=Asia/Kolkata → 2026-09-15T04:30:00.000Z   stored "2026-09-15 04:30:00"   displays "10:00 am"
```

The full suite (127 tests) passes under the default IST runtime **and** under `TZ=UTC`.
`clinicTime.test.ts` additionally runs conversions in child processes under `TZ=UTC`,
`Asia/Kolkata` and `America/New_York`, and includes a test that pins the *old* behaviour to show
it disagreed with itself.

### Existing data — CONFIRMED AFFECTED, not touched

Every session created through the production backend holds an instant **+5h30m** from the clinic
time the admin entered. This change does not alter a single existing row, by instruction.

Mitigating fact: **no Google event has ever been created** — credentials were never configured, so
no patient has received a wrong invitation. That window closes the moment credentials are set.

**Do not enable the Google integration until Phase 2 has assessed and corrected existing upcoming
sessions.** Phase 2 must begin read-only. A safe sizing query (clinic hours are ~09:00–18:00 IST,
so correct rows cluster at 03:30–12:30 UTC; un-shifted rows cluster at 09:00–18:00):

```sql
SELECT id, status, start_time,
       start_time AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata' AS as_ist
FROM therapy_sessions ORDER BY start_time DESC LIMIT 20;
```

Notes for whoever does Phase 2: a uniform −5:30 shift preserves relative ordering, so the
`EXCLUDE` overlap constraints stay satisfied; `created_at`/`updated_at` are genuine instants and
must **not** be shifted; and rows created from an IST machine (if any) would already be correct,
so the shift cannot be applied blindly — confirm with the query above against a restored snapshot
first.

## 9. Local dev quick-start

```bash
# backend
cd backend
npm install
npx prisma generate
# backend/.env needs DATABASE_URL and JWT_SECRET (see .env.example) — JWT_SECRET
# is required at import time (backend/src/auth/jwt.ts throws if unset)
npm run dev            # nodemon + ts-node, port 3001

# frontend
cd frontend
npm install
npm run dev             # Vite, port 5173
```
Frontend `frontend/.env.production` sets `VITE_API_URL=/api/v1` (relative — see §8c: Vercel proxies `/api/*` to the Render backend so the session cookie is first-party). Create `frontend/.env.local` (gitignored) with `VITE_API_URL=http://localhost:3001/api/v1` to hit a local backend instead of the proxy.

**Important:** the Vercel project also has a dashboard-level `VITE_API_URL` env var for Production, which **overrides** the committed `.env.production` file at build time. If the two ever diverge, the dashboard value wins — check there first when the deployed site is calling the wrong backend URL. (As of 2026-08-30 both are set to the relative `/api/v1`.)

## 10. Known conventions / gotchas to preserve

- No UI framework, no global state — inline styles + per-component `useState`, props drilled down.
- `sessionType` on `TherapySession` must always be explicitly propagated on any new code path that creates a session (create, reschedule, seed) — the DB default silently falls back to `"therapy"` and breaks discovery-call UX. This has bitten the codebase multiple times (see `context.md` §9, Bug 1).
- Mobile and desktop are separate JSX branches per page, not separate routes — remember to update both when touching `ScheduleListPage.tsx` or `PatientProfilePage.tsx`.
- Design tokens as of the latest revamp: primary teal `#3D9E8E`, sand background `#F7F2EC`, revenue/positive green `#16A34A`, semantic status colors (purple = no-show, red = dropped). Older `#2d6b5f` / `#1A7A6E` / `#1a2535` tokens were fully replaced — don't reintroduce them.
- Deploys: push to `main` → Render auto-deploys backend per `render.yaml` (Blueprint, `rootDir: backend`), Vercel (and possibly Netlify) auto-deploys frontend. Render runs `prisma migrate deploy` as a `preDeployCommand` before starting `node build/app.js` on each deploy. `DATABASE_URL` is `sync: false` in `render.yaml` — must be set manually in the Render dashboard.
- **`DATABASE_URL` must use Supabase's session pooler**, not the direct connection host and not the transaction pooler: `postgresql://postgres.<project-ref>:<password>@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres`. Direct host (`db.<ref>.supabase.co:5432`) is IPv6-only and unreachable from Render; the transaction pooler (port `6543`) breaks Prisma's prepared statements. Session pooler (port `5432` on the pooler hostname) is correct because this backend is a persistent long-running process, not serverless. See §8 2026-08-30 entry for the full debugging trail.
- Vercel's dashboard-level env vars (Project Settings → Environment Variables) **override** any same-named var in a committed `.env.production` file at build time — when the deployed frontend is hitting a stale/wrong backend URL, check the Vercel dashboard value first, not just the repo file.
- A real local Postgres test database (`numa_test`) is wired up via `backend/.env`'s `DATABASE_URL` — see CLAUDE.md rule #10 and §8e-i above. Use it for `*.integration.test.ts` coverage of anything a fake Prisma double can't prove (constraint behavior, real concurrency); never point it at Supabase production.
