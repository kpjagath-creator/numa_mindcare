# Numa Mindcare — Codebase Context

> Read this file first in every new session. It covers the full architecture, data model, business logic, and file map so you don't need to explore the codebase from scratch.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + TypeScript, React Router v6, Tailwind CSS |
| Backend | Node.js + Express.js + TypeScript |
| ORM | Prisma (PostgreSQL) |
| Hosting | Backend → Railway, Frontend → Vercel |
| Monorepo | `/backend` and `/frontend` are siblings under the repo root |

---

## Folder Structure

```
numa-mindcare/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # Single source of truth for DB models
│   │   ├── seed.ts
│   │   └── migrations/
│   └── src/
│       ├── app.ts                 # Express app entry point
│       ├── controllers/           # Thin HTTP handlers — call service, return response
│       ├── services/              # All business logic + DB access via Prisma
│       ├── routes/
│       │   └── index.ts           # Aggregator: mounts all resource routers under /api/v1
│       ├── validators/            # Zod schemas for request body validation
│       ├── types/index.ts         # Domain TypeScript types (mirrors schema)
│       ├── middleware/
│       │   ├── errorHandler.ts
│       │   └── logger.ts
│       ├── lib/prisma.ts          # Prisma singleton
│       └── utils/
│           ├── apiResponse.ts
│           ├── generateCodes.ts
│           └── responseHelper.ts
└── frontend/
    ├── index.html                 # Favicon: <link rel="icon" href="/logo.png" />
    └── src/
        ├── App.tsx                # React Router routes
        ├── main.tsx
        ├── types/index.ts         # Frontend domain types (keep in sync with backend)
        ├── constants/
        │   ├── statuses.ts        # Patient status labels, transitions, hints
        │   └── app.ts
        ├── api/                   # Axios wrappers per resource
        │   ├── api.ts             # Axios base instance (reads VITE_API_URL)
        │   ├── patients.ts
        │   ├── teamMembers.ts
        │   ├── therapySessions.ts
        │   ├── analytics.ts
        │   ├── availability.ts
        │   └── clinicalNotes.ts
        ├── hooks/
        │   └── useIsMobile.ts
        ├── pages/
        │   ├── dashboard/DashboardPage.tsx
        │   ├── billing/BillingPage.tsx
        │   ├── patients/
        │   │   ├── PatientListPage.tsx
        │   │   ├── RegisterPatientPage.tsx
        │   │   └── PatientProfilePage.tsx   # ← complex, ~700 lines
        │   ├── schedule/
        │   │   └── ScheduleListPage.tsx     # ← complex, ~600 lines, includes MobileSessionCard
        │   └── team/
        │       ├── TeamListPage.tsx
        │       ├── AddTeamMemberPage.tsx
        │       └── TeamMemberPatientsPage.tsx
        └── components/
            ├── layout/
            │   ├── Layout.tsx
            │   ├── Sidebar.tsx
            │   ├── TopBar.tsx
            │   └── MobileBottomNav.tsx
            ├── patients/
            │   ├── PatientStatusBadge.tsx
            │   ├── PatientTable.tsx
            │   ├── StatusHistoryLog.tsx
            │   └── StatusHistoryModal.tsx
            ├── schedule/
            │   ├── AddSessionModal.tsx      # ← session creation form, ~350 lines
            │   ├── SessionsTable.tsx        # ← desktop sessions table, ~500 lines
            │   ├── SessionActionsDropdown.tsx
            │   └── ClinicalNotesPanel.tsx
            ├── team/
            │   ├── TeamTable.tsx
            │   └── AvailabilityManager.tsx
            └── ui/
                ├── SearchableSelect.tsx     # Custom dropdown with search (used in AddSessionModal)
                ├── Toast.tsx                # ToastProvider context + useToast hook
                ├── ConfirmDialog.tsx
                ├── Breadcrumb.tsx
                ├── EmptyState.tsx
                ├── SkeletonTable.tsx
                └── Spinner.tsx
```

---

## Routes

All API routes are prefixed `/api/v1`.

### Patients — `/patients`
| Method | Path | Description |
|---|---|---|
| GET | `/patients` | List patients (paginated, filterable by status/therapist) |
| POST | `/patients` | Create patient |
| GET | `/patients/:id` | Get single patient |
| PATCH | `/patients/:id` | Update patient |
| DELETE | `/patients/:id` | Delete patient |
| GET | `/patients/:id/status-logs` | Patient status history |
| PATCH | `/patients/:id/status` | Manually change patient status |

### Team Members — `/team-members`
| Method | Path | Description |
|---|---|---|
| GET | `/team-members` | List team members |
| POST | `/team-members` | Create team member |
| GET | `/team-members/:id` | Get single member |
| PATCH | `/team-members/:id` | Update member |
| DELETE | `/team-members/:id` | Delete member |
| GET | `/team-members/:id/patients` | Patients assigned to this member |

### Therapy Sessions — `/therapy-sessions`
| Method | Path | Description |
|---|---|---|
| POST | `/therapy-sessions` | Create session |
| GET | `/therapy-sessions` | List sessions (filter: patient_id, therapist_id, date, status) |
| GET | `/therapy-sessions/therapist/:id` | Sessions for a specific therapist |
| GET | `/therapy-sessions/:id` | Get single session |
| PATCH | `/therapy-sessions/:id/cancel` | Cancel session |
| PATCH | `/therapy-sessions/:id/complete` | Complete session |
| POST | `/therapy-sessions/:id/reschedule` | Reschedule → marks original "rescheduled", creates new |
| PATCH | `/therapy-sessions/:id/no-show` | Mark no-show |
| PATCH | `/therapy-sessions/:id/payment-status` | Update payment status |
| DELETE | `/therapy-sessions/:id` | Delete session |

### Other
- `GET/POST/PATCH/DELETE /availability` — Therapist weekly availability + blockout dates
- `GET/POST/PATCH/DELETE /clinical-notes` — Session clinical notes
- `GET /analytics/...` — Dashboard analytics

---

## Database Models (Prisma)

### Patient
```
id, patientNumber (unique), name, mobile, email, age, source, referredBy
currentStatus (default: "created")  ← PatientStatus enum (see below)
therapistId (FK → TeamMember, nullable)
createdAt, updatedAt
relations: statusLogs, assignments, sessions
```

### PatientStatusLog
```
id, patientId (FK), previousStatus, newStatus, changedByName, changedByUserId, notes, createdAt
```

### TeamMember
```
id, employeeCode (unique), name, employeeType ("psychologist"|"psychiatrist")
isActive, createdAt, updatedAt
relations: assignments, therapistFor, sessions, availability, blockouts
```

### TherapySession
```
id, patientId, teamMemberId
startTime, endTime, durationMins (default 60)
status (default "upcoming") → "upcoming"|"completed"|"cancelled"|"no_show"|"rescheduled"
sessionType (default "therapy") → "therapy"|"discovery"
cancelReason, charges (Decimal), paymentStatus (default "unpaid"), noShowFee (Decimal)
rescheduledFromId (self-relation FK, nullable)
notes (String, nullable)
createdAt, updatedAt
relations: patient, teamMember, clinicalNotes
```

### PatientAssignment
```
id, patientId, teamMemberId, assignedAt, unassignedAt, isActive
```

### TherapistAvailability
```
id, teamMemberId, dayOfWeek (0=Sun), startTime ("09:00"), endTime ("18:00")
unique constraint: [teamMemberId, dayOfWeek]
```

### TherapistBlockout
```
id, teamMemberId, blockDate, reason
```

### ClinicalNote
```
id, sessionId (FK → TherapySession), content, createdByName, createdAt, updatedAt
```

---

## Patient Status Workflow

```
created
  │  (auto) Schedule a discovery call
  ▼
discovery_scheduled
  │  (auto) Complete the discovery session
  ▼
discovery_completed
  │  (auto) Schedule first therapy session
  ▼
started_therapy
  ├──(manual)──▶ schedule_completed   [terminal]
  ├──(manual)──▶ therapy_paused
  │                  │
  │            (manual)──▶ started_therapy
  │            (manual)──▶ patient_dropped   [terminal]
  └──(manual)──▶ patient_dropped   [terminal]
```

### Key rule: automatic transitions are triggered in the backend service layer
- `createSession` with `sessionType="discovery"` + patient is `"created"` → auto-set `"discovery_scheduled"`
- `completeSession` where session `sessionType="discovery"` + patient is `"discovery_scheduled"` → auto-set `"discovery_completed"`
- `createSession` with `sessionType="therapy"` + patient is `"discovery_completed"` → auto-set `"started_therapy"`

All three happen inside `prisma.$transaction` so they are atomic.

### Frontend status constants (`frontend/src/constants/statuses.ts`)
- `STATUS_LABELS` — human-readable label per status
- `STATUS_TRANSITIONS` — map of which statuses a user can manually transition to (empty array = auto-only or terminal)
- `STATUS_NEXT_ACTION_HINT` — hint text shown in the UI when no manual transition is available

---

## Discovery Call vs Therapy Session

### In AddSessionModal
- Toggle buttons: "Therapy Session" / "Discovery Call" — sets `form.session_type`
- When toggled, clears `patient_id` and `therapist_id` selections
- Discovery: filters patient dropdown to only `currentStatus === "created"` patients
- Therapy: filters patient dropdown to exclude `currentStatus === "created"` patients
- Info banner for discovery: "Scheduling this will automatically move the patient to Discovery Scheduled status."
- Button label: "Schedule Discovery Call" vs "Schedule Session"

### In SessionsTable (desktop) and ScheduleListPage (mobile)
- Discovery badge shown in the status column (below the status pill)
- Complete modal for discovery: mandatory notes textarea, no charges field
- Complete modal for therapy: optional charges input, no notes requirement
- `onComplete(id, charges?, notes?)` — for discovery, passes `(id, undefined, notes)`; for therapy, passes `(id, charges)`

### Reschedule/cancel rules
- Discovery sessions: can be rescheduled/cancelled while status is "upcoming"
- Once completed (`status === "completed"`), cannot be rescheduled (backend enforces: only upcoming sessions can be rescheduled)

---

## Frontend Routing (App.tsx)

```
/                     → DashboardPage
/billing              → BillingPage
/patients             → PatientListPage
/patients/new         → RegisterPatientPage
/patients/:id         → PatientProfilePage
/team                 → TeamListPage
/team/new             → AddTeamMemberPage
/team/:id/patients    → TeamMemberPatientsPage
/schedule             → ScheduleListPage
*                     → redirect to /
```

Patient name in the schedule table/cards is a clickable link to `/patients/:id`.

---

## Key Components

### SearchableSelect (`components/ui/SearchableSelect.tsx`)
Custom dropdown with search used in `AddSessionModal`. Props: `options`, `value`, `onChange`, `placeholder`, `disabled`.

### Toast (`components/ui/Toast.tsx`)
`ToastProvider` wraps the entire app. Use `useToast()` hook anywhere: `const { showToast } = useToast(); showToast("message", "success"|"error"|"info")`.

### PatientProfilePage (`pages/patients/PatientProfilePage.tsx`)
- Has `refreshPatientAndSessions()` which fetches both patient and sessions in parallel — call this after any session action so the patient status badge updates too.
- Status change modal renders only the valid `STATUS_TRANSITIONS[patient.currentStatus]` options. If empty, shows `STATUS_NEXT_ACTION_HINT` instead.
- Both desktop and mobile views are in the same file.

### ScheduleListPage (`pages/schedule/ScheduleListPage.tsx`)
- `MobileSessionCard` is a local component defined inside this file.
- `handleComplete(id, charges?, notes?)` is defined here and passed down.

### SessionsTable (`components/schedule/SessionsTable.tsx`)
- Desktop-only table view.
- `onComplete` prop: `(id: number, charges?: number, notes?: string) => void`
- Inline modals for cancel, complete, reschedule, no-show, payment status.

---

## API Layer (Frontend)

Base instance in `frontend/src/api/api.ts` reads `VITE_API_URL` env var.

Key function signatures in `frontend/src/api/therapySessions.ts`:
```typescript
createSession(payload: CreateSessionPayload): Promise<TherapySession>
// CreateSessionPayload: { patient_id, therapist_id, session_date, start_time, duration_mins, session_type?, notes? }

listSessions(params?: ListSessionsParams): Promise<ListSessionsResponse>
// ListSessionsParams: { page?, limit?, patient_id?, therapist_id?, date?, status? }

cancelSession(id, reason): Promise<TherapySession>
completeSession(id, charges?, notes?): Promise<TherapySession>
deleteSession(id): Promise<void>
rescheduleSession(id, { session_date, start_time, duration_mins, notes? }): Promise<TherapySession>
markNoShow(id, no_show_fee?): Promise<TherapySession>
updatePaymentStatus(id, payment_status, changed_by_name): Promise<TherapySession>
```

---

## Backend Service Layer

All files in `backend/src/services/`. They use Prisma directly (no repository pattern).

### therapySessionsService.ts
- `sessionInclude` constant: always includes `patient` (id, name, patientNumber) and `teamMember` (id, name, employeeType)
- `mapSession(raw)`: maps Prisma result to `TherapySession` type; `charges` and `noShowFee` coerced to `Number`
- Conflict detection: excludes sessions with status in `["cancelled", "rescheduled", "no_show"]`
- Reschedule: marks original as `"rescheduled"`, creates new session with `rescheduledFromId` pointing to original

---

## Conventions

- **Error format**: `{ success: false, error: { message: string, details?: unknown } }` with HTTP status code
- **Success format**: `{ success: true, data: { ... }, pagination?: { page, limit, total } }`
- **Prisma migrations**: run `npx prisma migrate dev --name <name>` in `/backend` after schema changes, then commit the migration file
- **Decimal fields** (`charges`, `noShowFee`): Prisma returns `Decimal` objects — always coerce with `Number()` in `mapSession`
- **Status strings**: stored as plain strings in DB (not enums) — validated in Zod validators
- **Mobile breakpoint**: `useIsMobile()` hook at 768px. Many pages have a desktop and mobile branch in the same file.
- **No authentication currently** — all API endpoints are open

---

## Environment Variables

### Backend (`.env`)
```
DATABASE_URL=postgresql://...
PORT=3001
```

### Frontend (`.env`)
```
VITE_API_URL=https://<railway-backend-url>/api/v1
```

---

## Deployment

- **Backend**: Railway — auto-deploys from `main` branch. Build cmd: `npm run build`. Start cmd: `node dist/app.js`.
- **Frontend**: Vercel — auto-deploys from `main` branch. Build cmd: `npm run build`. Output: `dist/`.
- **Migrations in prod**: Run `npx prisma migrate deploy` on the Railway backend after pushing schema changes.
