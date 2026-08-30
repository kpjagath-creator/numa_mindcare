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
- **TeamMember** — `employeeCode` (unique), name, `employeeType`, `isActive`. Relations: patients they're primary therapist for, session assignments, `TherapistAvailability`, `TherapistBlockout`.
- **TherapySession** — patientId, teamMemberId, start/end time, `durationMins`, `status` (upcoming/completed/cancelled/no_show), `cancelReason`, `charges` (Decimal), `paymentStatus`, `noShowFee`, self-referential `rescheduledFromId`/`rescheduledTo` for reschedule chains, **`sessionType`** ("therapy" | "discovery", default "therapy" — the field that drives most workflow branching), `notes`. Has many `ClinicalNote`.
- **PatientAssignment** — historical therapist assignment records (assignedAt/unassignedAt/isActive) — separate from the single `Patient.therapistId` "current therapist" pointer.
- **TherapistAvailability** — weekly recurring slots per therapist (dayOfWeek 0–6, startTime/endTime as "HH:MM" strings).
- **TherapistBlockout** — one-off blocked dates (leave/holiday) per therapist.
- **ClinicalNote** — free-form (not SOAP-structured) notes attached to a session, with `createdByName`.
- **User** — `username` (unique, login identifier), `email` (optional), `passwordHash`, `role`, `teamMemberId`, `passwordChangedAt`, `isActive`. Backs username/password auth as of 2026-08-30 — see §8a.

Migration history (`backend/prisma/migrations/`): init → add therapist-to-patient → add therapy sessions → add session status/duration → add session charges → add availability/reschedule/no-show/notes/payment → add session_type. This last migration is the one `context.md` documents in depth (it's the source of several "discovery vs therapy session" bugs that got fixed).

## 5. Backend API surface (`/api/v1`)

All routes below `/api/v1` except `/auth/login` require an authenticated session (see §8a); each route also declares a specific permission via `requirePermission`.

| Resource | Base path | Notes |
|---|---|---|
| Auth | `/auth` | `POST /login` (public), `POST /logout`, `GET /me`, `POST /change-password` |
| Patients | `/patients` | CRUD + `PATCH /:id/status`, `PATCH /:id/therapist`, `GET /:id/status-logs` |
| Team members | `/team-members` | CRUD-ish + `GET /:id/patients` |
| Therapy sessions | `/therapy-sessions` | create/list/get/delete + `/:id/cancel`, `/:id/complete`, `/:id/reschedule`, `/:id/no-show`, `/:id/payment-status`, `/therapist/:id` |
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
