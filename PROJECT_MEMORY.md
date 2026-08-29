# Numa MindCare — Project Memory & Architecture (as of 2026-08-30)

> This file is a snapshot of the repo state at the moment work resumed. `context.md` (repo root) is the older hand-maintained dev-context doc — read both; this file fills in the modules `context.md` doesn't cover (analytics, availability, clinical notes, billing, dashboard) and records the latest UI/UX pass.

---

## 1. What this is

**Numa MindCare** is an internal practice-management web app for a therapy/mental-health clinic. Single clinic, no multi-tenant concept. Tracks patients through a lifecycle (intake → discovery call → active therapy → paused/completed/dropped), schedules and bills therapy sessions, manages the therapist team and their availability, and surfaces basic clinical notes and revenue analytics.

Repo: https://github.com/kpjagath-creator/numa_mindcare (cloned to `D:\NMC\numa_mindcare`)
25 commits total, first commit `ded14bf` "initial project setup", latest `142f62d` "fix: unify dashboard and avatar colors to single teal across all sections" (2026-03-30).

## 2. Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite 5 + TypeScript 5, react-router-dom v6, axios. No UI framework — all inline `style` objects. |
| Backend | Node.js + Express 4 + TypeScript, Prisma 5 ORM, Zod for validation |
| Database | PostgreSQL |
| Frontend hosting | Vercel (rewrites `/* → /index.html`), also has a Netlify `_redirects` file for the same SPA-routing purpose |
| Backend hosting | Render (Blueprint defined in root `render.yaml`; `npx prisma migrate deploy` runs as a `preDeployCommand` before each deploy, then `node build/app.js` starts the server) |
| Local ports | backend `:3001`, frontend `:5173` (Vite proxies `/api/v1` → `:3001` in dev) |

No auth is wired into the frontend yet, but a `User` model (email/passwordHash/role/teamMemberId) exists in the Prisma schema — looks like login/RBAC was scaffolded but not built out.

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
- **User** — email/passwordHash/role/teamMemberId — scaffolded, not currently used by the frontend (no login screens in `App.tsx`).

Migration history (`backend/prisma/migrations/`): init → add therapist-to-patient → add therapy sessions → add session status/duration → add session charges → add availability/reschedule/no-show/notes/payment → add session_type. This last migration is the one `context.md` documents in depth (it's the source of several "discovery vs therapy session" bugs that got fixed).

## 5. Backend API surface (`/api/v1`)

| Resource | Base path | Notes |
|---|---|---|
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

Last handful of commits (newest first):
1. `142f62d` — unify dashboard/avatar colors to a single teal (#3D9E8E) — polish pass on top of the revamp below.
2. `f8c5ec6` — **complete UI/UX revamp** across all frontend pages: new design tokens (primary `#3D9E8E`, sand background `#F7F2EC`, semantic status colors — purple=no-show, red=dropped), SVG sidebar icons replacing emoji, avatar/initials columns on patient & team tables, restyled ConfirmDialog/Toast/EmptyState/SkeletonTable/SearchableSelect, standardized input height 44px / button height 40px / card radius 16px. Touched ~30 files.
3. `3abf87c` — fixed SPA routing on Netlify via `_redirects` (suggests both Vercel and Netlify have been tried/considered for frontend hosting).
4. A run of Railway backend deploy fixes (`191cce7`, `f83de4a`, `a089fe3`, `3d6856e`) around getting `prisma migrate deploy` to run reliably on startup without blocking the server if migration fails.
5. `067000a` — `context.md` added for session bootstrapping (that file is now one release behind — doesn't mention analytics/availability/clinicalNotes/billing/dashboard modules, which already exist in the code).
6. Before that: the discovery-call workflow feature and its bug-fix chain (`031f8e4`, `877e98`, `02c8de1`, `3877e98` etc.) — fully documented in `context.md` §9.

**Working theory of current state:** functionally complete-ish MVP (patients, sessions, team, availability, clinical notes, billing/analytics) with a UI/UX visual pass just finished. No visible in-progress feature branch — `main` is the only branch fetched. Good candidates for "what's next": wiring up the scaffolded `User`/auth model, reconciling `context.md` with the newer modules, or picking up whatever the user intended before stepping away (ask them).

## 9. Local dev quick-start

```bash
# backend
cd backend
npm install
npx prisma generate
npm run dev            # nodemon + ts-node, port 3001, needs DATABASE_URL in backend/.env

# frontend
cd frontend
npm install
npm run dev             # Vite, port 5173
```
Frontend `frontend/.env.production` points `VITE_API_URL` at the production backend by default — create `frontend/.env.local` (gitignored) with `VITE_API_URL=http://localhost:3001/api/v1` to hit local backend instead. **Not yet updated for the Render migration** — still points at the old Railway URL (`https://numa-mindcare-backend-production.up.railway.app/api/v1`); needs to be repointed at the new Render service URL once it's live.

## 10. Known conventions / gotchas to preserve

- No UI framework, no global state — inline styles + per-component `useState`, props drilled down.
- `sessionType` on `TherapySession` must always be explicitly propagated on any new code path that creates a session (create, reschedule, seed) — the DB default silently falls back to `"therapy"` and breaks discovery-call UX. This has bitten the codebase multiple times (see `context.md` §9, Bug 1).
- Mobile and desktop are separate JSX branches per page, not separate routes — remember to update both when touching `ScheduleListPage.tsx` or `PatientProfilePage.tsx`.
- Design tokens as of the latest revamp: primary teal `#3D9E8E`, sand background `#F7F2EC`, revenue/positive green `#16A34A`, semantic status colors (purple = no-show, red = dropped). Older `#2d6b5f` / `#1A7A6E` / `#1a2535` tokens were fully replaced — don't reintroduce them.
- Deploys: push to `main` → Render auto-deploys backend per `render.yaml` (Blueprint, `rootDir: backend`), Vercel (and possibly Netlify) auto-deploys frontend. Render runs `prisma migrate deploy` as a `preDeployCommand` before starting `node build/app.js` on each deploy. `DATABASE_URL` is `sync: false` in `render.yaml` — must be set manually in the Render dashboard.
