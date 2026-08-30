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

**Working theory of current state:** functionally complete-ish MVP (patients, sessions, team, availability, clinical notes, billing/analytics) with a UI/UX visual pass finished, and authentication + RBAC now implemented, locally validated, and deployed to production (see §8a and §8b). No visible in-progress feature branch — `main` is the only branch fetched. Good candidates for "what's next": reconciling `context.md` with the newer modules (it still predates auth and several other modules), adding a second real role beyond `admin`, or picking up whatever the user intended next (ask them).

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
Frontend `frontend/.env.production` points `VITE_API_URL` at the production backend by default — create `frontend/.env.local` (gitignored) with `VITE_API_URL=http://localhost:3001/api/v1` to hit local backend instead. Updated for the Render migration: now points at `https://numa-mindcare.onrender.com/api/v1`.

**Important:** the Vercel project also has a dashboard-level `VITE_API_URL` env var for Production, which **overrides** the committed `.env.production` file at build time. If the two ever diverge, the dashboard value wins — check there first when the deployed site is calling the wrong backend URL.

## 10. Known conventions / gotchas to preserve

- No UI framework, no global state — inline styles + per-component `useState`, props drilled down.
- `sessionType` on `TherapySession` must always be explicitly propagated on any new code path that creates a session (create, reschedule, seed) — the DB default silently falls back to `"therapy"` and breaks discovery-call UX. This has bitten the codebase multiple times (see `context.md` §9, Bug 1).
- Mobile and desktop are separate JSX branches per page, not separate routes — remember to update both when touching `ScheduleListPage.tsx` or `PatientProfilePage.tsx`.
- Design tokens as of the latest revamp: primary teal `#3D9E8E`, sand background `#F7F2EC`, revenue/positive green `#16A34A`, semantic status colors (purple = no-show, red = dropped). Older `#2d6b5f` / `#1A7A6E` / `#1a2535` tokens were fully replaced — don't reintroduce them.
- Deploys: push to `main` → Render auto-deploys backend per `render.yaml` (Blueprint, `rootDir: backend`), Vercel (and possibly Netlify) auto-deploys frontend. Render runs `prisma migrate deploy` as a `preDeployCommand` before starting `node build/app.js` on each deploy. `DATABASE_URL` is `sync: false` in `render.yaml` — must be set manually in the Render dashboard.
- **`DATABASE_URL` must use Supabase's session pooler**, not the direct connection host and not the transaction pooler: `postgresql://postgres.<project-ref>:<password>@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres`. Direct host (`db.<ref>.supabase.co:5432`) is IPv6-only and unreachable from Render; the transaction pooler (port `6543`) breaks Prisma's prepared statements. Session pooler (port `5432` on the pooler hostname) is correct because this backend is a persistent long-running process, not serverless. See §8 2026-08-30 entry for the full debugging trail.
- Vercel's dashboard-level env vars (Project Settings → Environment Variables) **override** any same-named var in a committed `.env.production` file at build time — when the deployed frontend is hitting a stale/wrong backend URL, check the Vercel dashboard value first, not just the repo file.
