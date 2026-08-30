# Numa MindCare — Architecture

Canonical reference for system structure, domain boundaries, dependency direction, data ownership, transaction boundaries, and the modular-monolith strategy. Read this alongside `SPEC.md` (product behavior) and `CLAUDE.md` (permanent engineering rules) — see §17 for how these documents relate.

Everything under "Current state" below was verified directly against the repository on 2026-08-30 (services, controllers, routes, `schema.prisma`, middleware, frontend pages/api clients). Everything under "Target" or "Recommendation" headings is **not implemented** — it describes a direction, not a fact about the code today.

---

## 1. Architecture Overview

**Numa MindCare is a modular monolith**: one backend deployable (Express/TS on Render), one frontend deployable (React/Vite on Vercel), one PostgreSQL database (Supabase), organized internally into feature-based modules (patients, scheduling, team, availability, clinical notes, billing, analytics, auth) that currently share one codebase, one process, and one schema.

Request flow:

```
Browser (React SPA)
   │  axios, withCredentials
   ▼
frontend/src/api/*.ts  (one file per backend resource)
   │  HTTP, /api/v1/*
   ▼
backend/src/routes/*.ts  →  middleware (auth, permission)  →  controllers/*.ts
   │
   ▼
backend/src/services/*.ts   (all business logic + Prisma calls live here)
   │
   ▼
Prisma Client  →  PostgreSQL (Supabase)
```

**Why this stays a monolith:** single clinic, no multi-tenancy (SPEC.md §Non-goals), one small team, one Postgres instance, no component with an independent scaling or independent-deploy requirement. Nothing in SPEC.md or the current traffic/data shape demands independently deployable services.

**Microservices are not currently justified.** There is no cross-team ownership boundary, no component needing separate scaling, and no evidence of a bottleneck that a monolith can't absorb. Introducing service boundaries now would add distributed-transaction and deployment complexity (e.g., the patient-lifecycle/session coupling described in §5 would become a distributed transaction) without a corresponding benefit. Revisit only if a concrete, demonstrated driver emerges (see §15).

---

## 2. Current Backend Architecture

Verified structure (`backend/src/`):

| Layer | Location | Role |
|---|---|---|
| Routes | `routes/*.ts`, aggregated in `routes/index.ts` | Declare paths, attach `requirePermission(...)` per endpoint, delegate to controllers |
| Middleware | `middleware/requireAuth.ts`, `middleware/requirePermission.ts`, `middleware/errorHandler.ts`, `middleware/logger.ts`, `middleware/loginRateLimit.ts` | Authentication, authorization, structured error responses, request logging, login throttling |
| Controllers | `controllers/*.ts` | Thin — parse/shape the request, call one service function, shape the response. No business logic, no direct Prisma access (verified: no `prisma.` usage found in any controller) |
| Validators | `validators/*.ts` | Zod schemas per resource, used by controllers before calling services |
| Services | `services/*.ts` | **All** business logic and **all** Prisma calls live here. Every service imports the shared Prisma client directly (`import prisma from "../lib/prisma"`) |
| Data access | `lib/prisma.ts` | Single `PrismaClient` singleton, shared by every service |
| Auth | `auth/jwt.ts`, `auth/cookies.ts`, `auth/password.ts`, `auth/permissions.ts` | JWT signing/verification, cookie config, password hashing, the RBAC permission map |
| Shared utilities | `utils/apiResponse.ts`, `utils/responseHelper.ts`, `utils/generateCodes.ts` | Response envelope helpers, patient-number generation |

**Dependency direction (verified):**

```
routes → controllers → services → Prisma → PostgreSQL
```

- Controllers never call Prisma directly.
- **No service imports another service** — grep across `services/*.ts` found zero cross-service imports. Every service reaches the database independently through the shared Prisma client.
- This means module isolation today comes from *file-organization convention and the absence of service-to-service calls*, not from an enforced boundary. Nothing in the codebase (no lint rule, no dependency-cruiser config, no module index) would stop a new service from importing another service's internals or writing directly to a table it doesn't own. See §5 for the one place this already matters in practice.

Do not read this as stronger isolation than it is: "no service imports another service" is true today by discipline, and by the fact that cross-domain writes (§5) are done by reaching into Prisma models directly rather than by calling another domain's service.

---

## 3. Domain Boundaries

Domains below are organized by file/folder convention (one service file per domain), not by an enforced module boundary. Where a domain's service writes to another domain's tables, it's called out explicitly.

### Patients
- **Owns:** patient registration, profile data, manual status transitions, therapist assignment, status audit log.
- **Key entities:** `Patient`, `PatientStatusLog`, `PatientAssignment`.
- **Key behavior:** `createPatient` (transactional — generates patient number, creates patient, writes initial status log), `updatePatientStatus` (manual transitions, writes status log), `updatePatientTherapist`, `updatePatientInfo`, `getStatusLogs`. Source: `backend/src/services/patientsService.ts`.
- **Depends on:** `TeamMember` (read-only, to validate/display assigned therapist).
- **Depended on by:** Scheduling (writes `Patient.currentStatus` and `PatientStatusLog` directly — see §5).

### Patient lifecycle
Not a separate backend module — it's a cross-cutting concern (state machine on `Patient.currentStatus`) whose *manual* transitions are owned by the Patients domain and whose *automatic* transitions are currently implemented inside the Scheduling domain's service. See §5 and §6.

### Scheduling / Therapy sessions
- **Owns:** session create/list/get/delete, cancel, complete, reschedule, no-show, payment-status update, per-therapist scheduling conflict detection.
- **Key entities:** `TherapySession`.
- **Key behavior:** `backend/src/services/therapySessionsService.ts` (400 lines — the largest and most central service). Conflict detection excludes `cancelled`/`rescheduled`/`no_show` sessions when checking for time-range overlaps for a given patient or therapist.
- **Depends on:** `Patient` (existence check, read `currentStatus`), `TeamMember` (existence check).
- **Cross-domain writes:** creates/updates `Patient.currentStatus` and inserts `PatientStatusLog` rows directly, inside the same Prisma transaction as the session write, for the auto-advance rules in §6. This is a verified, current architectural seam — see §5.

### Team / Therapists
- **Owns:** team member CRUD, listing a therapist's assigned patients.
- **Key entities:** `TeamMember`.
- **Behavior:** `backend/src/services/teamMembersService.ts`.
- **Depends on:** none beyond its own table (patients-by-therapist listing reads `Patient` for display, read-only).

### Availability
- **Owns:** weekly recurring availability slots and one-off blockout dates per therapist.
- **Key entities:** `TherapistAvailability`, `TherapistBlockout`.
- **Behavior:** `backend/src/services/availabilityService.ts`. Implemented as its own service file, though the entities are conceptually "team" data (see §4 note on `TeamMember`'s relations).
- **Depends on:** `TeamMember` (existence check).

### Clinical notes
- **Owns:** free-form (non-SOAP) notes attached to a session.
- **Key entities:** `ClinicalNote`.
- **Behavior:** `backend/src/services/clinicalNotesService.ts` — create/list/update/delete, scoped to a `sessionId`.
- **Depends on:** `TherapySession` (existence check; notes are attached to a session, not a patient directly).
- **Note:** the "Discovery Notes" card on the patient profile (SPEC.md §4) is computed client-side by filtering the patient's sessions for a completed discovery session with notes — it is not a separate backend query or entity.

### Billing / payment tracking
- **Not a separate backend service.** Payment status (`TherapySession.paymentStatus`), `charges`, and `noShowFee` are fields on `TherapySession`, updated via `updatePaymentStatus` in `therapySessionsService.ts`. The frontend's `BillingPage.tsx` is a dedicated view, but there is no `billingService.ts` — billing logic is scheduling logic. Revenue aggregation lives in Analytics.

### Analytics
- **Owns:** dashboard KPIs and revenue reporting.
- **Behavior:** `backend/src/services/analyticsService.ts` (245 lines) — reads across `Patient`, `TherapySession`, and related tables to compute aggregates. This is a legitimate, intentional cross-domain reader (see §5) — it does not write to any table outside its own concern.

### Authentication / authorization
- **Owns:** login/logout, session issuance, current-user lookup, password change, and the centralized RBAC permission map.
- **Key entities:** `User`.
- **Behavior:** `backend/src/services/authService.ts`, `backend/src/auth/*.ts`. JWT in an httpOnly cookie (`numa_session`, 12h expiry, verified in `auth/jwt.ts`); `requireAuth` middleware re-checks the user is active and that the token predates the last password change (verified in `middleware/requireAuth.ts`) so password changes invalidate old sessions without a server-side session table. RBAC is a static `Role → Permission[]` map in `auth/permissions.ts` (verified: no `role === "admin"` checks found outside this file); routes declare `requirePermission("resource:action")`.
- **Depends on:** none. Every other domain depends on it (via the `requireAuth`/`requirePermission` middleware chain).

---

## 4. Data Ownership

Verified against `backend/prisma/schema.prisma` (single schema, single `PrismaClient`, no per-domain database or schema separation):

| Entity / Table | Owning domain | Notes |
|---|---|---|
| `Patient` | Patients | Also written by Scheduling (see §5) |
| `PatientStatusLog` | Patients | Also written by Scheduling (see §5) |
| `PatientAssignment` | Patients | Historical assignment records, separate from `Patient.therapistId` |
| `TherapySession` | Scheduling | Includes payment/charge fields — billing is not a separate table |
| `TeamMember` | Team | |
| `TherapistAvailability` | Availability | Relationally hangs off `TeamMember`, but has its own service |
| `TherapistBlockout` | Availability | Relationally hangs off `TeamMember`, but has its own service |
| `ClinicalNote` | Clinical notes | Scoped to a `TherapySession`, not to `Patient` directly |
| `User` | Authentication | Optionally links to `TeamMember` via `teamMemberId`, but is otherwise independent |

**Shared PostgreSQL and Prisma access do not imply shared domain ownership.** Every service can technically query or write any table through the shared Prisma client — there is no database-level or ORM-level restriction. The table above states which domain is the *intended* owner (i.e., which service is expected to write it); it is not enforced by tooling today. The one place ownership is currently crossed in practice is documented in §5.

---

## 5. Cross-Domain Dependencies

Legitimate, currently-implemented cross-domain relationships:

- **Scheduling → Patient lifecycle (write).** `therapySessionsService.ts` directly updates `Patient.currentStatus` and inserts `PatientStatusLog` rows in `createSession` (discovery scheduled → `discovery_scheduled`; therapy scheduled while `discovery_completed` → `started_therapy`) and in `completeSession` (discovery completed → `discovery_completed`). **This is documented here honestly as a current architectural seam, not a designed cross-domain API.** Scheduling reaches into Patients' owned tables directly rather than calling a Patients-owned operation. It is transactionally correct (same `tx`) but structurally couples the two domains at the code level — the Patients domain does not have a single function that owns "what happens on a status change"; that logic is split between `patientsService.updatePatientStatus` (manual) and inline blocks in `therapySessionsService.ts` (automatic).
- **Scheduling → Patient/Team (read).** Every session operation validates patient/therapist existence via a straight `findUnique` — a normal, low-risk read dependency.
- **Clinical → Therapy sessions.** `clinicalNotesService.ts` requires a valid `sessionId` (existence check against `TherapySession`) — notes are scoped to sessions, not directly to patients. Legitimate read dependency, no write-side coupling.
- **Billing → Therapy sessions.** Not a separate domain in code (§3) — payment fields live on `TherapySession` itself, so there is no cross-domain relationship to document beyond "billing is part of scheduling's owned data."
- **Analytics → multiple operational domains (read-only).** `analyticsService.ts` reads `Patient` and `TherapySession` (and related aggregates) to compute dashboard/revenue figures. This is an intentional, appropriate pattern for a monolith's reporting layer — the risk to watch (§11) is analytics logic growing dependent on the *internal* shape of other domains' tables as those tables evolve, rather than reading through a stable, intentional interface.

**Summary of the one seam requiring attention:** therapy-session workflows currently contain patient-lifecycle side effects (writing `Patient`/`PatientStatusLog` directly). This is called out in CLAUDE.md rule #1 as the source of most historical bugs (see `context.md` §9 for the incident history) and is the top candidate for the boundary-strengthening work described in §12–14. No change is being made as part of this document.

---

## 6. Business Invariants

These are invariants the current implementation enforces (or documents) today. Preserve them in any future feature work; do not weaken or bypass them without an explicit product decision.

1. **`sessionType` must be explicit on every code path that creates or copies a `TherapySession`.** The Prisma column default (`"therapy"`) silently applies if omitted, which breaks discovery-call status auto-advance and UI branching. Verified in `schema.prisma` (`sessionType String @default("therapy")`) and called out in CLAUDE.md rule #1 and `context.md` §9 (Bug 1: a past regression where `rescheduleSession` omitted it). `rescheduleSession` in `therapySessionsService.ts` currently copies `sessionType: original.sessionType` explicitly (line 313) — this must be preserved on any future change to that function.
2. **Patient lifecycle transitions** (verified in `frontend/src/constants/statuses.ts` and `SPEC.md` §3):
   - Automatic (driven by session events, inside a transaction): `created → discovery_scheduled` (discovery call scheduled), `discovery_scheduled → discovery_completed` (discovery call completed), `discovery_completed → started_therapy` (first therapy session scheduled).
   - Manual (staff-initiated): `started_therapy → schedule_completed | therapy_paused | patient_dropped`; `therapy_paused → started_therapy | patient_dropped`.
   - Auto-advance triggers only when the *current* status matches the expected precondition (e.g., scheduling a therapy session for a patient who is not `discovery_completed` does not advance status) — verified in `therapySessionsService.ts` (`if (sessionType === "discovery" && patient.currentStatus === "created")`, etc.).
3. **Discovery vs. therapy is determined solely by `TherapySession.sessionType`.** There is no separate "is this a discovery booking" flag anywhere else in the system (SPEC.md §3, `context.md` §6).
4. **Scheduling conflict rules:** a patient or a therapist cannot have two overlapping sessions unless one is `cancelled`, `rescheduled`, or `no_show` (`CONFLICT_EXCLUDED_STATUSES` in `therapySessionsService.ts`). Enforced at the application layer via a `findFirst` overlap query inside the same transaction as the write — **not** enforced by a database constraint (see §11 for the concurrency implication).
5. **Session lifecycle:** a session has status `upcoming | completed | cancelled | no_show | rescheduled`. Only `upcoming` sessions can be rescheduled (`rescheduleSession` throws 400 otherwise). Rescheduling marks the original `rescheduled` and creates a new `upcoming` session linked via `rescheduledFromId`.
6. **Payment state** (`paymentStatus` on `TherapySession`) is tracked manually per session, not derived or charged automatically (SPEC.md §7 non-goals). `updatePaymentStatus` writes a `PatientStatusLog` entry (`payment_<status>`) as an audit trail even though it's a session-level, not patient-level, change — verified in `therapySessionsService.ts`.
7. **Patient assignment:** `Patient.therapistId` is the single "current therapist" pointer; `PatientAssignment` is a separate historical record. Changing therapist writes both the pointer update and a `PatientStatusLog` entry describing the change, not a new lifecycle status (`updatePatientTherapist` in `patientsService.ts`).
8. **Clinical-note requirement:** completing a discovery call requires notes (SPEC.md §4); completing a therapy session accepts optional charges instead. This branching is currently enforced in the frontend (`SessionsTable.tsx` / `ScheduleListPage.tsx` complete-modal logic, per `context.md` §7) — **verify at the backend/validator level before relying on it as a hard invariant**; treat frontend-only enforcement of a business rule as a gap to note, not a decision to preserve unchanged (see §9, §11).

Anything not listed above (e.g., specific UI copy, button colors, exact status label text) is a UI/UX detail, not a business invariant, and is out of scope for this document.

---

## 7. Transaction Boundaries

Verified `prisma.$transaction` usage, all in `backend/src/services/*.ts`:

| Operation | Transaction covers | Why atomicity matters |
|---|---|---|
| `createPatient` (`patientsService.ts`) | Patient-number generation + patient row create + initial `PatientStatusLog` | A patient must never exist without its `created` audit log entry |
| `updatePatientStatus` (`patientsService.ts`) | Status update + `PatientStatusLog` insert | Status changes must always be audited; log and state must not diverge |
| `updatePatientTherapist` (`patientsService.ts`) | Therapist reassignment + `PatientStatusLog` insert | Same as above, for therapist changes |
| `createSession` (`therapySessionsService.ts`) | Patient/therapist existence checks + conflict checks + session create + (conditionally) patient status update + status log | Session creation and any resulting lifecycle auto-advance must succeed or fail together — a session must never exist with the patient left in a stale status |
| `completeSession` (`therapySessionsService.ts`) | Session status/charges/notes update + (conditionally) patient status update + status log | Same reasoning — completing a discovery call and advancing the patient's status must be atomic |
| `rescheduleSession` (`therapySessionsService.ts`) | Mark original `rescheduled` + conflict re-check + create new linked session | The original must never end up `rescheduled` without a successor session existing |
| `updatePaymentStatus` (`therapySessionsService.ts`) | Payment status update + `PatientStatusLog` insert | Payment changes must be auditable atomically with the change itself |

Operations that read-then-write outside a single transaction (e.g., `cancelSession`, `markNoShow`, `deleteSession`) are single-row updates with a prior existence check — acceptable because they touch exactly one row and have no dependent side effect to keep in sync.

**Known concurrency risk (not fixed here):** scheduling-conflict detection (`createSession`, `rescheduleSession`) is a `findFirst` overlap check performed *inside* the same transaction as the subsequent write, but Prisma's default transaction isolation (Postgres `READ COMMITTED`) does not prevent two concurrent transactions from both reading "no conflict" before either commits its write — a classic check-then-act race. Two simultaneous booking requests for the same therapist/time slot could both succeed, producing a double-booking the application-level check was meant to prevent. There is no database-level exclusion constraint (e.g., a Postgres `EXCLUDE` constraint on the time range) backing this invariant. This is a real, currently-unaddressed risk at the concurrency level the current single-clinic traffic volume has likely not yet exposed — see §11.

---

## 8. API Architecture

- **Versioning:** all routes are mounted under `/api/v1` (`routes/index.ts`), giving room for a future `/api/v2` without breaking existing clients.
- **Resource boundaries:** one router file per resource (`patients`, `teamMembers`, `therapySessions`, `analytics`, `availability`, `clinicalNotes`), aggregated in `routes/index.ts`. `auth` is mounted separately and is the only public resource group (`POST /auth/login` is reachable unauthenticated; every other `/auth` route enforces `requireAuth` itself).
- **Controller/service separation:** verified — controllers parse/validate the request and call exactly one service function; no business logic or Prisma access in controllers.
- **Command-style lifecycle endpoints:** therapy sessions expose explicit action endpoints rather than a single generic update — `/:id/cancel`, `/:id/complete`, `/:id/reschedule`, `/:id/no-show`, `/:id/payment-status` (verified in `routes/therapySessions.ts` / SPEC.md §5) — each maps to one named business operation in the service layer, not an arbitrary field-level `PATCH`. This is a pattern worth continuing: **APIs should expose business operations (e.g., "complete this session") rather than unrestricted state mutation, where the underlying change is a business event, not a data edit.** Patient status changes similarly go through `PATCH /:id/status`, not a general patient update endpoint.
- **Authentication middleware:** `requireAuth` is mounted globally on `/api/v1` below `/auth` (verified in `routes/index.ts`) — every resource route requires an established session.
- **Authorization:** `requirePermission("resource:action")` is declared per-route (verified pattern in `auth/permissions.ts` and route files) and checks against the centralized `ROLE_PERMISSIONS` map — never an inline role check.
- **Error handling:** a single global `errorHandler` (mounted last in `app.ts`) — services throw `Error` objects annotated with a `statusCode` property (e.g., `makeNotFoundError`, `makeConflictError` helpers in `therapySessionsService.ts`); Zod validation errors are caught and mapped to `400` with structured `details`; everything else defaults to `500`. Response envelope is consistently `{ success, data }` or `{ success: false, error: { message, details? } }`.

---

## 9. Frontend Architecture

Verified structure (`frontend/src/`):

- **Routing:** `App.tsx` defines the route table with `react-router-dom` v6; every route except `/login` is wrapped in `ProtectedRoute` (verified in `App.tsx` / `components/auth/ProtectedRoute.tsx`), which checks `AuthContext`.
- **Pages:** one file per route under `pages/<domain>/`, e.g. `pages/patients/PatientProfilePage.tsx`, `pages/schedule/ScheduleListPage.tsx`. Pages currently own their own data fetching, mutation handlers, and full JSX — there is no shared data-fetching hook layer.
- **Components:** organized by domain under `components/<domain>/` (patients, schedule, team) plus a generic `components/ui/` (Toast, ConfirmDialog, SkeletonTable, etc.) and `components/layout/` (Sidebar, TopBar, MobileBottomNav, Layout).
- **API clients:** one file per backend resource under `api/` (`api/patients.ts`, `api/therapySessions.ts`, etc.), all built on a single shared Axios instance (`api/api.ts`) with `withCredentials: true` for the cookie session, and a response interceptor that dispatches a custom `auth:unauthorized` event on `401` (consumed by `AuthContext`).
- **Auth context:** `auth/AuthContext.tsx` — calls `GET /auth/me` on load, exposes `user`, `login`, `logout`, and `hasPermission(permission)` for permission-aware UI (e.g., hiding "create" buttons the current role can't use).
- **Local state:** no global state library — `useState` and prop drilling throughout, confirmed by grep (no Redux/Zustand/Context beyond `AuthContext` and `Toast`). This is an intentional, current constraint (CLAUDE.md: "Don't add a UI framework or global state library").
- **Responsive design:** no separate mobile routes. `useIsMobile()` (`hooks/useIsMobile.ts`) drives conditional rendering *within* a page. `PatientProfilePage.tsx` and `ScheduleListPage.tsx` each contain two full JSX branches (mobile and desktop) for the same page.

**Known maintenance risk — verified by direct measurement, not assumption:** `PatientProfilePage.tsx` is 951 lines and `ScheduleListPage.tsx` is 689 lines (`wc -l`, 2026-08-30), each combining data-fetching, multiple mutation handlers, and duplicated mobile/desktop JSX in one file. `BillingPage.tsx` (534 lines) and `DashboardPage.tsx` (480 lines) are the next-largest. **The frontend has not been refactored into feature-scoped hooks or smaller components** — this document records that risk; it does not claim any mitigation has been applied.

---

## 10. Scalability Strategy

| Horizon | Direction |
|---|---|
| **Current** | Layered modular monolith: routes → controllers → services → Prisma → PostgreSQL, one deployable per side, domains separated by file convention. |
| **Near term** | Stronger domain ownership and invariant enforcement — centralize patient-lifecycle transition logic behind one entry point (see §12), add tests around the invariants in §6. |
| **Medium term** | Explicit module boundaries (folder-per-domain with a defined public surface) and some form of automated dependency-boundary enforcement (lint rule or dependency-cruiser), so the "no service imports another service" property in §2 stops depending on discipline alone. |
| **Future** | Read models and/or background jobs only where a measured workload justifies them (e.g., if analytics aggregation becomes slow against live operational tables) — not adopted speculatively. |

Scalability for this system should come from: clear domain boundaries, efficient queries/indexes (verify against actual query patterns before adding indexes speculatively), correct transaction boundaries (§7), maintainable service-sized files, an actual automated test suite (none currently exists — see §11), and observability — not from splitting the deployment topology. **Do not recommend or plan microservices** unless a concrete business or technical driver (e.g., multi-clinic/multi-tenant requirement, a component needing independent scaling, or a team-ownership split) actually materializes.

---

## 11. Architectural Risks

### Current (present in the codebase today)
- **`therapySessionsService.ts` is the largest and most central service (400 lines)** and already writes outside its own domain (Patient/PatientStatusLog) — the clearest candidate for becoming an orchestration/"god service" as more session-triggered side effects are added.
- **Patient lifecycle logic is distributed across two files** (`patientsService.ts` for manual transitions, `therapySessionsService.ts` for automatic ones) with no shared entry point — see §5.
- **Database access is not isolated by domain.** Every service can query/write any table through the shared Prisma client; nothing technical prevents a new service from repeating the §5 pattern in a new place.
- **No automated module-boundary enforcement** (lint rule, dependency-cruiser, or similar) exists to keep the current clean layering from eroding as more code is added.
- **Large frontend pages**: `PatientProfilePage.tsx` (951 lines), `ScheduleListPage.tsx` (689 lines) mix data-fetching, mutation handling, and duplicated mobile/desktop JSX (§9).
- **`any`-typed Prisma query clauses**: `listSessions` and `getTherapistSessions` in `therapySessionsService.ts` build their `where` object as `any`, bypassing Prisma's generated types — a schema/field rename would not be caught at compile time here.
- **No automated test suite exists.** Verified: no `*.test.ts`/`*.spec.ts` files in `backend/src` or `frontend/src`, and no `test` script in either `package.json`. The invariants in §6 are currently protected only by code review and manual QA (per `PROJECT_MEMORY.md` §8b's manual smoke-test list).
- **A business invariant (discovery-call notes required on completion) currently appears to be enforced only in the frontend** (`context.md` §7), not verified at the backend/validator layer — this should be confirmed and, if true, is a gap between "business invariant" and "enforced invariant."
- **Scheduling has no database-level uniqueness/exclusion constraint** backing the overlap-conflict rule (§7) — it is entirely an application-level `findFirst` check.

### Future (would emerge as the system grows, not present today)
- **Scheduling concurrency risk** (§7): the check-then-act overlap detection is subject to a race condition under concurrent booking requests for the same therapist/slot. Low risk at current single-clinic traffic; becomes a real risk if concurrent booking volume increases (e.g., multiple front-desk staff booking simultaneously) or if the clinic scope grows.
- **Analytics coupling to operational schema**: as `analyticsService.ts` grows, it risks depending on the internal field shapes of other domains' tables rather than a stable read interface, making unrelated schema changes in Patients/Scheduling silently break analytics.
- **Database constraints/indexing** may need strengthening as data volume grows — e.g., an index on `TherapySession(teamMemberId, startTime)` / `(patientId, startTime)` to keep conflict-detection queries fast, and a possible Postgres `EXCLUDE` constraint for the overlap invariant. Not evaluated against real query plans as part of this document — a future measurement-driven pass, not a current fix.

---

## 12. Target Architecture

Recommended direction for the next 2–3 years — **still a modular monolith**, with domain ownership made explicit in code rather than implied by file naming. This is a target, not a plan being executed now.

```
                         ┌─────────────────────────────┐
                         │        Frontend (SPA)        │
                         └───────────────┬──────────────┘
                                          │ /api/v1
                         ┌───────────────▼──────────────┐
                         │   Routes + Auth Middleware    │
                         └───────────────┬──────────────┘
        ┌──────────┬──────────┬──────────┼──────────┬───────────┬────────────┐
        ▼          ▼          ▼          ▼          ▼           ▼            ▼
    Patients   Scheduling   Team    Availability  Clinical   Billing*    Analytics
   (owns Patient (owns       (owns   (owns slots/  (owns      (fields on  (read-only
    + status log  Therapy    Team    blockouts)    Clinical   TherapySession, across all)
    + assignment) Session)   Member)               Note)      not a
                                                                separate
                                                                module)
        ▲              │
        │  public op   │  calls Patients' public
        │  e.g.        │  operation instead of
        └──────────────┘  writing Patient directly
```

*Billing remains fields on `TherapySession` (as today) unless a future requirement (e.g., invoicing, multiple charges per session) justifies extracting it.

**Core principle for cross-domain operations:** a domain that needs to change another domain's owned state should call an explicit, public operation on that domain's service — not write the table directly. Concretely: **Scheduling should invoke a patient-lifecycle operation (e.g., `patientsService.applyLifecycleEvent(tx, patientId, event)`) rather than directly setting `Patient.currentStatus` and inserting `PatientStatusLog` itself.** The Prisma transaction (`tx`) is still threaded through from Scheduling so atomicity is preserved (§7) — what changes is *who owns the decision logic*, not the transactional mechanics.

Domain module folders (`modules/patients/`, `modules/scheduling/`, etc., each with one `index.ts` public surface) are a reasonable future step once there's a second or third case needing the same boundary discipline — not required to introduce the pattern above for the one seam that exists today.

No new infrastructure (message queue, event bus, separate databases) is part of this target.

---

## 13. Architectural Principles for New Features

Rules to follow when implementing future features in this codebase:

1. Every significant feature must have an owning domain — decide which domain owns it before writing code, using §3/§4 as the reference.
2. Every important piece of state must have a clear owning domain (extend the table in §4 when adding a new entity).
3. A domain should not directly mutate another domain's owned state. If §5's existing seam needs to grow (more session-triggered patient effects), route it through a public operation on the owning domain (§12) rather than adding another inline cross-write.
4. Cross-domain workflows should use explicit public operations, not ad hoc reads/writes into another domain's tables.
5. The backend owns business invariants (§6). Do not let a rule (e.g., "discovery completion requires notes") exist only in frontend validation — verify and enforce it server-side.
6. The frontend represents UX, not the authoritative business-rule engine — server responses (and the backend's own validation) are the source of truth.
7. Keep controllers thin — parsing, validation delegation, and response shaping only.
8. Keep business logic in services (or, once introduced, domain/application logic within a module) — not in controllers, not in route files.
9. Use `prisma.$transaction` around any operation where multiple writes must succeed or fail together (see §7 for the existing pattern) — most importantly, any operation touching both a business state and its audit log.
10. Preserve the `sessionType` and patient-lifecycle invariants documented in §6 exactly — they are the most historically fragile part of this codebase (CLAUDE.md rule #1, `context.md` §9).
11. Prefer incremental refactoring over rewrites — e.g., extract one cross-domain write into a public operation at a time, don't restructure the whole service layer in one change.
12. Do not introduce microservices without a demonstrated business or technical need (§1, §10).
13. Do not introduce repositories or generic data-access abstractions merely for architectural fashion — the current "service talks to Prisma directly" pattern is working and should only change if a concrete duplication or testability problem justifies it.
14. Analytics may perform cross-domain reads, but should avoid becoming coupled to the arbitrary internal structure of other domains' tables as those domains evolve — prefer reading through stable, intentional shapes over reaching into implementation details.
15. New, non-trivial domains (anything beyond a simple CRUD resource) should have explicit module boundaries considered from the start, rather than starting as an unstructured service file and needing a later boundary retrofit.

---

## 14. Evolution / Migration Strategy

Recommended incremental sequence for evolving the current codebase. **None of this is being implemented as part of this document** — it is a sequencing reference for future work.

1. Centralize patient-lifecycle logic — give Patients a single public operation for lifecycle transitions; have Scheduling call it instead of writing `Patient`/`PatientStatusLog` directly (addresses §5, §11).
2. Protect critical business invariants (§6) with automated tests — there are currently none; start with the invariants most tied to historical bugs (`sessionType` propagation, conflict detection, status auto-advance).
3. Reduce `therapySessionsService.ts`'s responsibility as step 1 lands — it should end up owning session lifecycle and conflict detection only, not patient state.
4. Improve database typing (`Prisma.TherapySessionWhereInput` instead of `any`, §11) and evaluate whether stronger DB constraints (index or `EXCLUDE` constraint for the conflict invariant, §7/§11) are warranted based on actual query patterns.
5. Decompose large frontend pages (§9) incrementally — extract page-scoped data/mutation hooks the next time either large page is touched for a feature, not as a standalone refactor.
6. Introduce explicit module boundaries (folder-per-domain, public `index.ts`) for new or increasingly complex domains as they arise, rather than retrofitting all seven existing domains at once.
7. Add automated dependency-boundary enforcement (lint rule / dependency-cruiser) once the module-folder convention from step 6 exists to enforce.
8. Optimize database/query patterns based on measured workload, not speculation.
9. Introduce background jobs or read models only when a specific, measured need justifies them (e.g., analytics aggregation becoming slow against live tables).

---

## 15. Things We Explicitly Will NOT Do Without Evidence

The current architecture, scale (single clinic, no multi-tenancy), and team size do not justify any of the following. These may be reconsidered only if a concrete product or technical requirement emerges — not preemptively:

- Microservices
- Database-per-service
- Event-bus architecture
- Kafka (or any message broker)
- Premature CQRS
- A data warehouse
- A generic repository framework/abstraction layer
- A complete backend rewrite
- A complete frontend rewrite
- Redux (or any global state library) solely because the application has grown — CLAUDE.md already establishes this constraint; it stands until a concrete state-sharing problem (not just app size) demonstrates a need.

---

## 16. Architectural Decision Records (lightweight)

Decisions verifiable from the current repository. Where historical rationale (who decided, when, why at the time) isn't independently verifiable from commit history or docs, it's labeled as **current architectural rationale** rather than asserted as historical fact.

- **Modular monolith, not microservices.** Current rationale: single clinic, no multi-tenancy (SPEC.md §7), one small team, no independent-scaling need identified anywhere in the requirements.
- **PostgreSQL + Prisma as the sole datastore/ORM.** Verified: `backend/prisma/schema.prisma`, `DATABASE_URL` on Supabase. No other datastore exists in the codebase.
- **Express backend.** Verified: `backend/src/app.ts`. No framework migration evidence anywhere in git history reviewed.
- **Thin controller / fat service architecture.** Verified via direct inspection: zero Prisma usage in any controller; all business logic and transactions in `services/*.ts`. Documented explicitly in CLAUDE.md and `PROJECT_MEMORY.md` §3.
- **API versioning via `/api/v1` path prefix.** Verified: `routes/index.ts` mounts a single `v1Router`; no other version prefix exists yet, leaving room for a future `/api/v2`.
- **Centralized RBAC via a static Role→Permission map**, not scattered role checks. Verified: `auth/permissions.ts` is the only file defining role/permission logic; `requirePermission` middleware is the only enforcement point. Current rationale (stated in the file's own comment): a new role should be addable "without touching route code."
- **Cookie-based authentication (httpOnly JWT), not a bearer token in localStorage.** Verified: `auth/jwt.ts`, `auth/cookies.ts`, `frontend/src/api/api.ts` (`withCredentials: true`). Current rationale, per `PROJECT_MEMORY.md` §8c: avoids exposing the token to client-side JS/XSS, at the cost of needing the Vercel proxy workaround for first-party cookie behavior across the Vercel/Render domain split — that incident and fix are documented in `PROJECT_MEMORY.md` §8c, not restated here.
- **Single-clinic architecture, no multi-tenancy.** Verified: no `clinicId`/`tenantId` or equivalent anywhere in `schema.prisma`; explicitly stated as a non-goal in SPEC.md §7.

---

## 17. Relationship to Other Documentation

```
SPEC.md          → product requirements and behavior: what the system does
ARCHITECTURE.md  → system structure, domain boundaries, dependencies,
                    data ownership, and architectural decisions: how the
                    system is built and why (this document)
CLAUDE.md        → permanent engineering rules: hard constraints an agent
                    or developer must not violate (deployment gotchas,
                    invariants, "don't" list)
context.md       → hand-maintained implementation reference: file-level
                    detail, component walkthroughs. Known to be one
                    release behind current code (predates auth and
                    several modules — see PROJECT_MEMORY.md §5) — treat
                    as historically useful but verify against the actual
                    code before relying on specifics.
PROJECT_MEMORY.md → dated history log: past bugs, incidents, deployment
                    fixes, and the reasoning behind them
```

These documents are meant to complement, not duplicate, each other. When adding a feature: check SPEC.md for *what* is required, this document for *where it belongs and what boundaries to respect*, CLAUDE.md for *hard rules that must not be violated*, and update PROJECT_MEMORY.md afterward with a dated entry per its existing convention. Do not copy content between them — link or reference instead, so each stays the single source of truth for its own concern.
