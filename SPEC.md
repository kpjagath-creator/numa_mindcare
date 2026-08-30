# Numa MindCare — Product Spec

Single-clinic practice-management web app for a therapy/mental-health practice. No multi-tenancy. This document describes *what the product does*; see `CLAUDE.md` for engineering rules and `PROJECT_MEMORY.md`/`context.md` for implementation history.

## 1. Users & access

Staff-only tool, accessed via username/password login. Centralized permission-based RBAC (`resource:action` grants per role, defined in `backend/src/auth/permissions.ts`); currently one role (`admin`) is in use, but the model supports adding more without touching route code. A session is a signed JWT in an httpOnly cookie, valid 12 hours.

## 2. Core entities

- **Patient** — a person moving through the clinic's intake-to-therapy lifecycle. Has a unique patient number, contact info, source/referral info, a current status, and an optional assigned therapist.
- **Team member** — a therapist or other staff member. Has a unique employee code, type, active flag, weekly recurring availability, and one-off blockout dates (leave/holiday).
- **Therapy session** — a scheduled appointment between a patient and a therapist. Two kinds:
  - **Discovery call** — free intake call, no charges, clinical notes required on completion.
  - **Therapy session** — billable, charges optional per session.
  Sessions carry a status (upcoming/completed/cancelled/no_show), payment status, optional charges, and support rescheduling (which chains to the original via `rescheduledFromId`).
- **Clinical note** — free-form note attached to a completed session, attributed to the author. Starts as a **draft** (editable/deletable); once **signed**, its content, author, and signature are immutable, and further changes are recorded as append-only **amendments** that never alter the original signed text.
- **Patient status log** — audit trail of every status change (who, when, previous → new, optional notes).

## 3. Patient lifecycle

```
created → discovery_scheduled → discovery_completed → started_therapy → schedule_completed
                                                              ↓
                                                       therapy_paused ⇄ started_therapy
                                                              ↓                ↓
                                                       patient_dropped   patient_dropped
```

- **Automatic transitions** (driven by session lifecycle, inside a DB transaction):
  - Scheduling a discovery call for a `created` patient → `discovery_scheduled`.
  - Completing a discovery call → `discovery_completed`.
  - Scheduling a therapy session for a `discovery_completed` patient → `started_therapy`.
- **Manual transitions** (staff-initiated from the patient profile):
  - `started_therapy` → `schedule_completed` / `therapy_paused` / `patient_dropped`
  - `therapy_paused` → `started_therapy` / `patient_dropped`

The session's `sessionType` field ("discovery" vs "therapy") is the single source of truth for which auto-advance rule applies — there is no separate "is this a discovery booking" flag.

## 4. Features

### Patients
- Register a new patient (intake).
- List/search patients; view a full profile (status, sessions, clinical notes, status history).
- Change patient status (manual transitions above) with an audit log entry.
- Assign/reassign a primary therapist.
- Context-aware "Schedule" call-to-action on the profile page — labeled and typed (discovery vs therapy) based on current status.

### Scheduling
- Create, list, cancel, complete, reschedule, and mark no-show for sessions — from a dedicated Schedule page or from a patient's profile.
- Completing a discovery call requires notes; completing a therapy session accepts optional charges.
- Rescheduling preserves the original session's type and links the new session back to it.
- Track per-session payment status.
- **Booking is concurrency-safe**: two simultaneous requests for the same patient/therapist and overlapping time can never both succeed — enforced at the database level (see ARCHITECTURE.md §6.4), not just by an application-level check.
- **Booking (and rescheduling) is availability-aware**: a session may only be created for an active therapist, within one of their configured weekly availability windows, and not on a one-off blocked-out date. The Schedule page's "Add Session" form shows a live availability indicator for the selected therapist/date/time as a UX aid; the backend independently re-validates and is the sole source of truth.

### Team / availability
- Manage team members (create, list, view a therapist's assigned patients).
- Set weekly recurring availability slots per therapist.
- Record one-off blockout dates (leave/holidays) per therapist.

### Clinical notes
- Attach, edit, and delete free-form **draft** notes on a session.
- **Sign a note** to lock it: content, author, signed-by, and signed-at become permanent — a signed note can no longer be edited or deleted (enforced server-side).
- **Add an amendment** to a signed note — an append-only, individually-attributed follow-up entry that never alters the original signed content.
- The most recent completed discovery call's notes surface on the patient profile as a highlighted "Discovery Notes" card, visible to any therapist who later works with the patient.

### Patient timeline
- The patient profile shows a unified, chronological **Timeline** composing the patient's lifecycle/status changes, therapist assignment changes, sessions, payment status changes, and clinical notes (including sign-off) into one ordered view, distinguished by type. Read-only — all mutation still happens through the existing patient/session/notes UI.

### Billing & analytics
- Revenue and payment-status views (Billing page).
- Dashboard KPIs: revenue summary, upcoming sessions overview.

## 5. API surface (`/api/v1`)

All endpoints require an authenticated session except `POST /auth/login`. Each endpoint also enforces a specific RBAC permission.

| Resource | Base path | Endpoints |
|---|---|---|
| Auth | `/auth` | `POST /login`, `POST /logout`, `GET /me`, `POST /change-password` |
| Patients | `/patients` | CRUD, `PATCH /:id/status`, `PATCH /:id/therapist`, `GET /:id/status-logs`, `GET /:id/timeline` |
| Team members | `/team-members` | CRUD-ish, `GET /:id/patients` |
| Therapy sessions | `/therapy-sessions` | create/list/get/delete, `/:id/cancel`, `/:id/complete`, `/:id/reschedule`, `/:id/no-show`, `/:id/payment-status`, `/therapist/:id` |
| Analytics | `/analytics` | `GET /dashboard`, `GET /revenue` |
| Availability | `/availability` | `PUT/GET /therapist/:id/slots`, `POST/GET /therapist/:id/blockouts`, `DELETE /blockouts/:id` |
| Clinical notes | `/clinical-notes` | `POST/GET /session/:sessionId`, `PUT/DELETE /:id`, `PATCH /:id/sign`, `POST /:id/amendments` |

## 6. Frontend routes

```
/                     Dashboard — KPIs, revenue, upcoming sessions
/billing              Revenue / payment-status views
/patients             Patient list
/patients/new         Register patient
/patients/:id         Patient profile — status workflow, sessions, clinical notes, schedule CTA
/team                 Team list
/team/new             Add team member
/team/:id/patients    Team member's assigned patients
/schedule             Schedule — desktop table / mobile cards; create/complete/cancel/reschedule
```
All routes except `/login` require an authenticated session. Every page renders distinct mobile/desktop layouts rather than using separate routes.

## 7. Non-goals / current scope boundaries

- No multi-tenant / multi-clinic support.
- No patient-facing UI — staff tool only.
- No payment processing integration — payment status is tracked manually, not charged automatically.
- No SOAP-structured clinical notes — free-form text only.
- Single role in active use today, though the permission model supports more.
