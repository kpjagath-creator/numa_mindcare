# Numa MindCare — Developer Context Document

> **Purpose:** Fast-start reference for any agent or developer working on this codebase. Covers product, architecture, key files, data models, workflows, and all notable changes made to date. Read this before touching any code.

---

## 1. Product Overview

**Numa MindCare** is a therapy practice management tool for mental health professionals. It manages:
- **Patients** — lifecycle from intake through therapy
- **Therapy Sessions** — scheduling, completing, rescheduling, cancelling
- **Team Members / Therapists** — assigned to patients and sessions
- **Payments** — session-level charge tracking

There are two kinds of sessions:
- **Discovery Call** (`sessionType = "discovery"`) — free intake call, no charges, notes required on completion
- **Therapy Session** (`sessionType = "therapy"`) — billable session, charges optional

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript (no UI framework, all inline styles) |
| Backend | Node.js + Express.js + TypeScript |
| ORM | Prisma |
| Database | PostgreSQL |
| Frontend hosting | Vercel |
| Backend hosting | Railway |
| Local dev (frontend) | `http://localhost:5173` |
| Local dev (backend) | `http://localhost:3001` |

---

## 3. Repository Structure

```
numa-mindcare/
├── frontend/
│   ├── .env                          ← VITE_API_URL points to Railway production
│   ├── vite.config.ts                ← Proxy: /api/v1 → localhost:3001 in dev
│   └── src/
│       ├── api/
│       │   ├── api.ts                ← Axios base instance (baseURL from VITE_API_URL or /api/v1)
│       │   ├── sessions.ts           ← createSession, listSessions, completeSession, etc.
│       │   └── patients.ts           ← getPatient, listPatients, updatePatientStatus, etc.
│       ├── components/
│       │   └── schedule/
│       │       ├── SessionsTable.tsx          ← Desktop sessions table (Schedule & Patient Profile)
│       │       ├── SessionActionsDropdown.tsx ← Per-row action dropdown
│       │       └── AddSessionModal.tsx        ← Modal to create new session
│       ├── pages/
│       │   ├── schedule/
│       │   │   └── ScheduleListPage.tsx       ← Schedule list page (desktop table + mobile cards)
│       │   └── patients/
│       │       └── PatientProfilePage.tsx     ← Patient detail page with sessions, status, CTA
│       ├── constants/
│       │   └── statuses.ts                    ← Patient status list, labels, transitions, hints
│       └── types/
│           └── index.ts                       ← TherapySession, Patient, TeamMember interfaces
│
├── backend/
│   └── src/
│       ├── app.ts                             ← Express app entry point
│       ├── routes/
│       │   └── therapySessionRoutes.ts        ← All /therapy-sessions routes
│       ├── controllers/
│       │   └── therapySessionsController.ts   ← Route handlers (thin — delegates to service)
│       └── services/
│           └── therapySessionsService.ts      ← ALL business logic, Prisma calls, status auto-advance
│
├── .claude/
│   └── launch.json                            ← Dev server config for preview tool (Windows-specific)
└── CONTEXT.md                                 ← This file
```

---

## 4. Environment & API

### Frontend `.env`
```
VITE_API_URL=https://numa-mindcare-backend-production.up.railway.app/api/v1
```
> **Important:** This means all API calls go to **Railway production** even during local dev, unless you create a `frontend/.env.local` with:
> ```
> VITE_API_URL=http://localhost:3001/api/v1
> ```
> `.env.local` is git-ignored and overrides `.env`.

### Axios base (`frontend/src/api/api.ts`)
```typescript
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "/api/v1",
  headers: { "Content-Type": "application/json" },
});
```

### Backend dev script (`backend/package.json`)
```
"dev": "nodemon --watch 'src/**/*.ts' --exec ts-node src/app.ts"
```
Auto-restarts on any `.ts` file change. Runs on port **3001**.

### `.claude/launch.json` (preview server — Windows only)
```json
{
  "configurations": [
    { "name": "backend", "runtimeExecutable": "cmd", "runtimeArgs": ["/c", "npm", "run", "dev"],
      "cwd": "C:/Users/kpjag/OneDrive/Desktop/tool/numa-mindcare/backend", "port": 3001 },
    { "name": "frontend", "runtimeExecutable": "cmd", "runtimeArgs": ["/c", "npm", "run", "dev"],
      "cwd": "C:/Users/kpjag/OneDrive/Desktop/tool/numa-mindcare/frontend", "port": 5173 }
  ]
}
```
> **Windows note:** Must use `cmd /c npm` — bare `npm` as `runtimeExecutable` causes `spawn npm ENOENT` on Windows.

---

## 5. Data Models

### Patient
```typescript
{
  id: number;
  name: string;
  currentStatus: PatientStatus;   // drives entire workflow — see Section 6
  therapistId?: number;
  // ...contact fields
}
```

### TherapySession
```typescript
{
  id: number;
  patientId: number;
  teamMemberId: number;
  startTime: string;              // ISO datetime
  endTime: string;
  durationMins: number;
  sessionType: "therapy" | "discovery";  // CRITICAL — drives UI branching & status transitions
  status: "upcoming" | "completed" | "cancelled" | "no_show";
  paymentStatus: PaymentStatus;
  notes?: string;
  charges?: number;
  rescheduledFromId?: number;     // set when this session is a reschedule of another
  patient: { id: number; name: string };
  therapist: { id: number; name: string };
}
```

### Prisma schema field for sessionType
```prisma
sessionType  String  @default("therapy")  @map("session_type")
```

---

## 6. Patient Status Workflow

### Status enum (ordered)
```
created → discovery_scheduled → discovery_completed → started_therapy
                                                            ↓          ↓            ↓
                                                 schedule_completed  therapy_paused  patient_dropped
                                                                          ↓
                                                                  started_therapy / patient_dropped
```

### Automatic transitions (backend — `therapySessionsService.ts`, inside `prisma.$transaction`)

| Trigger | From | To |
|---|---|---|
| Schedule a `discovery` session | `created` | `discovery_scheduled` |
| Complete a `discovery` session | `discovery_scheduled` | `discovery_completed` |
| Schedule a `therapy` session | `discovery_completed` | `started_therapy` |

> **Rule:** Status auto-advances ONLY when `sessionType` matches. A `therapy` session for a `created` patient does NOT advance status. `sessionType` on the session record is the single source of truth.

### Manual transitions (from PatientProfilePage buttons)
- `started_therapy` → `schedule_completed` / `therapy_paused` / `patient_dropped`
- `therapy_paused` → `started_therapy` / `patient_dropped`

---

## 7. Key Components — Detailed Reference

### `AddSessionModal.tsx`
**Path:** `frontend/src/components/schedule/AddSessionModal.tsx`

**Purpose:** Creates a new session. Used from both Schedule page and Patient Profile page.

**Props:**
```typescript
{
  onClose: () => void;
  onCreated: () => void;
  initialPatientId?: number;             // hides patient selector, locks to this patient
  initialSessionType?: "therapy" | "discovery";  // hides type toggle, locks session type
}
```

**State init with props:**
```typescript
const [form, setForm] = useState<FormValues>({
  ...EMPTY,  // defaults: session_type = "therapy"
  ...(initialSessionType ? { session_type: initialSessionType } : {}),
  ...(initialPatientId ? { patient_id: String(initialPatientId) } : {}),
});
```

**Patient filtering logic:**
- `session_type === "discovery"` → only patients with `currentStatus === "created"` or `"discovery_scheduled"`
- `session_type === "therapy"` → excludes `"created"` and `"discovery_scheduled"` patients

**UI hiding:**
- Patient select hidden when `initialPatientId` is provided
- Session type toggle hidden when `initialSessionType` is provided

**Opened from:**
1. Schedule page — no pre-fills, user picks type and patient manually
2. Patient Profile page — both `initialPatientId` and `initialSessionType` pre-filled

---

### `SessionsTable.tsx`
**Path:** `frontend/src/components/schedule/SessionsTable.tsx`

**Purpose:** Desktop table of sessions. Renders inside Patient Profile and Schedule pages.

**Discovery pill (status column):**
```tsx
<div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
  <span style={statusBadgeStyle}>• {statusLabel}</span>
  {sess.sessionType === "discovery" && (
    <span style={{ fontSize: 10, fontWeight: 700, background: "#dbeafe", color: "#1d4ed8",
                   borderRadius: 4, padding: "1px 5px" }}>
      Discovery
    </span>
  )}
</div>
```

**Complete modal branching:**
```tsx
{completingSess.sessionType === "discovery" ? (
  // Shows: textarea for notes (required), no charges
) : (
  // Shows: charges input (optional), no notes enforcement
)}
```

**State reset when opening complete modal** (important — must reset both paths):
```tsx
onComplete={(id) => {
  setCompleteId(id);
  setChargesInput(""); setChargesError("");
  setDiscoveryNotes(""); setDiscoveryNotesError("");
}}
```

---

### `SessionActionsDropdown.tsx`
**Path:** `frontend/src/components/schedule/SessionActionsDropdown.tsx`

**Purpose:** Per-row dropdown for session actions (Complete, Cancel, Reschedule, No-show, etc.).

**Width:** Uses `width: 120` (not `maxWidth`) to ensure all rows have consistent dropdown width.

---

### `ScheduleListPage.tsx` — `MobileSessionCard`
**Path:** `frontend/src/pages/schedule/ScheduleListPage.tsx`

**Purpose:** Mobile card view for sessions on the Schedule list page.

**Discovery pill:** Shown below status pill when `sess.sessionType === "discovery"`.

**Complete form branching:** Same `sess.sessionType === "discovery"` check — notes vs charges.

**State reset on Complete button click:**
```tsx
onClick={() => {
  setShowCompleteInput(true);
  setCharges(""); setDiscoveryNotes(""); setDiscoveryNotesError("");
}}
```

---

### `PatientProfilePage.tsx`
**Path:** `frontend/src/pages/patients/PatientProfilePage.tsx`

**Purpose:** Full patient detail view. Shows patient info, current status, action buttons, sessions list.

**Context-aware Schedule CTA logic:**
```typescript
// Status → button label + initialSessionType passed to AddSessionModal
"created"             → "📅 Schedule Discovery Call"  (initialSessionType = "discovery")
"discovery_scheduled" → "📅 Schedule Discovery Call"  (initialSessionType = "discovery")
"discovery_completed" → "📅 Schedule Session"          (initialSessionType = "therapy")
"started_therapy"     → "📅 Schedule Session"          (initialSessionType = "therapy")
"therapy_paused"      → "📅 Schedule Session"          (initialSessionType = "therapy")
// No CTA shown for: schedule_completed, patient_dropped
```

**CTA button colors:**
- Discovery (status = `created` / `discovery_scheduled`) → blue (`#0369a1`)
- Therapy (other eligible statuses) → green (`#1A7A6E`)

**AddSessionModal render (appears in BOTH mobile and desktop view sections):**
```tsx
{showAddSession && (
  <AddSessionModal
    initialPatientId={patient.id}
    initialSessionType={
      (patient.currentStatus === "created" || patient.currentStatus === "discovery_scheduled")
        ? "discovery" : "therapy"
    }
    onClose={() => setShowAddSession(false)}
    onCreated={() => {
      setShowAddSession(false);
      void refreshPatientAndSessions();
      showToast("Session scheduled.", "success");
    }}
  />
)}
```

**Session refresh:**
```typescript
async function refreshPatientAndSessions() {
  const [p, r] = await Promise.all([
    getPatient(patientId),
    listSessions({ patient_id: patientId, limit: 200 }),
  ]);
  setPatient(p);
  setSessions(r.sessions);
  setNewStatus("");
}
```

---

### `therapySessionsService.ts` (backend)
**Path:** `backend/src/services/therapySessionsService.ts`

**The most important backend file.** All business logic and Prisma calls live here.

**Key functions:**

#### `createSession(input)`
- Validates therapist/patient existence
- Resolves start/end datetime
- Creates session inside `prisma.$transaction`
- Auto-advances patient status in same transaction:
  ```typescript
  if (sessionType === "discovery" && patient.currentStatus === "created") {
    await tx.patient.update({ where: { id }, data: { currentStatus: "discovery_scheduled" } });
  }
  if (sessionType === "therapy" && patient.currentStatus === "discovery_completed") {
    await tx.patient.update({ where: { id }, data: { currentStatus: "started_therapy" } });
  }
  ```

#### `completeSession(id, input)`
- Marks session `completed`, saves notes/charges
- Auto-advances status: `discovery_scheduled → discovery_completed` (for discovery sessions)

#### `rescheduleSession(id, input)` — CRITICAL
- Cancels the original session
- Creates a new upcoming session
- **Must copy `sessionType` from original** — this was a past bug (see Section 9):
  ```typescript
  const newSession = await tx.therapySession.create({
    data: {
      patientId: original.patientId,
      teamMemberId: original.teamMemberId,
      startTime: startDt,
      endTime: endDt,
      durationMins: input.duration_mins,
      sessionType: original.sessionType,   // ← copy this — was missing, caused all discovery bugs
      status: "upcoming",
      notes: input.notes ?? original.notes ?? null,
      rescheduledFromId: original.id,
    },
  });
  ```

#### `mapSession(raw)` — internal mapper
Converts Prisma raw result to API response shape. Key field:
```typescript
sessionType: raw.sessionType ?? "therapy",
```

---

### `statuses.ts`
**Path:** `frontend/src/constants/statuses.ts`

Exports:
- `PATIENT_STATUSES` — ordered array of all status strings
- `STATUS_LABELS` — human-readable labels for display
- `STATUS_TRANSITIONS` — allowed manual transitions per status (drives action buttons)
- `STATUS_NEXT_ACTION_HINT` — help text for pending-action statuses (shown on profile page)

---

## 8. API Endpoints

All prefixed with `/api/v1`:

| Method | Path | Description |
|---|---|---|
| `POST` | `/therapy-sessions` | Create session (body: `patient_id`, `therapist_id`, `session_date`, `start_time`, `duration_mins`, `session_type`, `notes?`) |
| `GET` | `/therapy-sessions` | List sessions (params: `patient_id?`, `limit?`, `page?`) |
| `GET` | `/therapy-sessions/:id` | Get single session |
| `PATCH` | `/therapy-sessions/:id/complete` | Complete session (body: `charges?`, `notes?`) |
| `POST` | `/therapy-sessions/:id/reschedule` | Reschedule — creates new, cancels old |
| `PATCH` | `/therapy-sessions/:id/cancel` | Cancel session |
| `PATCH` | `/therapy-sessions/:id/no-show` | Mark no-show |
| `PATCH` | `/therapy-sessions/:id/payment-status` | Update payment status |
| `DELETE` | `/therapy-sessions/:id` | Delete session |
| `GET` | `/therapy-sessions/therapist/:id` | Sessions by therapist |

---

## 9. Bugs Fixed & Why — Institutional Knowledge

### Feature: Discovery Notes in Patient Profile
**What it does:** After a discovery session is completed with notes, those notes appear as a blue "Discovery Notes" card in the patient profile (both mobile and desktop), above the status buttons. Shows therapist name and date. Visible to any future therapist/psychiatrist assigned to the patient.

**Source:** `PatientProfilePage.tsx` — computed inline as `sessions.find(s => s.sessionType === "discovery" && s.status === "completed" && s.notes)`.

**No backend change needed** — notes are already saved to the session `notes` field via the existing complete-session API.

---



### Bug 1: Rescheduled discovery call loses its identity
**Symptom:** After rescheduling a discovery call, the new session shows no Discovery pill, shows charges modal on complete, doesn't enforce notes, doesn't advance patient status.

**Root cause:** `rescheduleSession` in `therapySessionsService.ts` created the new session without `sessionType` — Prisma used the DB default `"therapy"`.

**Fix:** Added `sessionType: original.sessionType` to the `create` call in `rescheduleSession`.

**Commit:** `3877e98`

---

### Bug 2: Duplicate Discovery badge
**Symptom:** "Discovery" pill appeared twice — once in patient name column, once in status column.

**Root cause:** Badge was rendered in both columns. The patient name column rendering was left from an early implementation.

**Fix:** Removed badge from patient name column in `SessionsTable.tsx` and mobile card header in `ScheduleListPage.tsx`. Kept only next to the status pill.

**Commit:** `02c8de1`

---

### Bug 3: Complete modal showed stale state
**Symptom:** Opening the complete modal for a discovery session after previously completing a therapy session showed leftover charges/notes state.

**Root cause:** `onComplete` handler only reset `chargesInput`/`chargesError`, not `discoveryNotes`/`discoveryNotesError`.

**Fix:** Added `setDiscoveryNotes(""); setDiscoveryNotesError("")` to the `onComplete` click handler in `SessionsTable.tsx`. Same fix in MobileSessionCard `setShowCompleteInput` click in `ScheduleListPage.tsx`.

**Commit:** `02c8de1`

---

### Bug 4: Dropdown width inconsistency
**Symptom:** Action dropdown widths varied by row content.

**Fix:** Changed `maxWidth: 110` → `width: 120` in `SessionActionsDropdown.tsx`.

**Commit:** `3877e98`

---

### Bug 5: No schedule CTA on patient profile page
**Symptom:** Users had to navigate to the schedule page to create sessions; no quick action from patient profile.

**Fix:** Added context-aware "Schedule Discovery Call" / "Schedule Session" button to PatientProfilePage in both mobile and desktop views. Opens `AddSessionModal` with `initialPatientId` and `initialSessionType` pre-filled based on patient status.

**Commit:** `3877e98`

---

### Bug 6: `discovery_scheduled` patients missing from discovery session dropdown
**Symptom:** When creating a new discovery call for a patient already in `discovery_scheduled` status (e.g., to reschedule), the patient didn't appear in the `AddSessionModal` patient list.

**Root cause:** Patient filter for discovery only included `currentStatus === "created"`. Patients in `discovery_scheduled` were excluded.

**Fix:** Added `"discovery_scheduled"` to the discovery patient filter in `AddSessionModal`.
Also updated `PatientProfilePage` CTA condition to include `discovery_scheduled` status.

**Commit:** `7f9a4af`

---

## 10. UI Patterns & Conventions

- **No UI library** — all styles are inline React `style` objects
- **No global state** — `useState` per component, prop drilling for shared data
- **Toast notifications** — `showToast(message, type)` from a shared hook/context
- **Collapsible cards** — `<CollapsibleCard>` with `storageKey` for localStorage-persisted open/close state
- **Status pills** — `<StatusPill status={...}>` for session status; separate inline Discovery badge for session type
- **Mobile vs Desktop split:**
  - `ScheduleListPage` renders `MobileSessionCard` (mobile) and `SessionsTable` (desktop) conditionally
  - `PatientProfilePage` has separate mobile and desktop JSX sections, both must include any new UI (e.g., CTA buttons, modals)
- **Button color convention:**
  - Teal/green (`#1A7A6E`) — primary therapy actions
  - Blue (`#0369a1`) — discovery / informational actions
  - Red — destructive (cancel, delete)

---

## 11. Development Workflow

### Local dev
```bash
# Terminal 1 — Backend (port 3001)
cd backend && npm run dev

# Terminal 2 — Frontend (port 5173)
cd frontend && npm run dev
```

Create `frontend/.env.local` to point at local backend:
```
VITE_API_URL=http://localhost:3001/api/v1
```

### Making schema changes
1. Edit `backend/prisma/schema.prisma`
2. `cd backend && npx prisma migrate dev --name <name>`
3. `npx prisma generate` (regenerates client)
4. Update `mapSession()` in `therapySessionsService.ts` if the new field needs to appear in API responses

### Deployment
- Push to `main` → auto-deploys backend to Railway, frontend to Vercel

---

## 12. File Quick-Reference

| What you need to change | File |
|---|---|
| Session create / complete / reschedule / cancel logic | `backend/src/services/therapySessionsService.ts` |
| Session API route definitions | `backend/src/routes/therapySessionRoutes.ts` |
| Session API controller (request parsing) | `backend/src/controllers/therapySessionsController.ts` |
| Create new session modal | `frontend/src/components/schedule/AddSessionModal.tsx` |
| Desktop sessions table (Discovery pill, complete modal) | `frontend/src/components/schedule/SessionsTable.tsx` |
| Row action dropdown | `frontend/src/components/schedule/SessionActionsDropdown.tsx` |
| Schedule list page & mobile cards | `frontend/src/pages/schedule/ScheduleListPage.tsx` |
| Patient detail page (CTA, status buttons, sessions) | `frontend/src/pages/patients/PatientProfilePage.tsx` |
| Patient status constants & valid transitions | `frontend/src/constants/statuses.ts` |
| Frontend API call functions | `frontend/src/api/sessions.ts`, `frontend/src/api/patients.ts` |
| Axios instance / base URL config | `frontend/src/api/api.ts` |
| TypeScript type definitions | `frontend/src/types/index.ts` |
| Prisma DB schema | `backend/prisma/schema.prisma` |
| Dev server launch config (Windows) | `.claude/launch.json` |
