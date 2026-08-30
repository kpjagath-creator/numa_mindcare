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
- **Clinical note** — free-form note attached to a completed session, attributed to the author.
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

### Team / availability
- Manage team members (create, list, view a therapist's assigned patients).
- Set weekly recurring availability slots per therapist.
- Record one-off blockout dates (leave/holidays) per therapist.

### Clinical notes
- Attach, edit, and delete free-form notes on a session.
- The most recent completed discovery call's notes surface on the patient profile as a highlighted "Discovery Notes" card, visible to any therapist who later works with the patient.

### Billing & analytics
- Revenue and payment-status views (Billing page).
- Dashboard KPIs: revenue summary, upcoming sessions overview.

## 5. API surface (`/api/v1`)

All endpoints require an authenticated session except `POST /auth/login`. Each endpoint also enforces a specific RBAC permission.

| Resource | Base path | Endpoints |
|---|---|---|
| Auth | `/auth` | `POST /login`, `POST /logout`, `GET /me`, `POST /change-password` |
| Patients | `/patients` | CRUD, `PATCH /:id/status`, `PATCH /:id/therapist`, `GET /:id/status-logs` |
| Team members | `/team-members` | CRUD-ish, `GET /:id/patients` |
| Therapy sessions | `/therapy-sessions` | create/list/get/delete, `/:id/cancel`, `/:id/complete`, `/:id/reschedule`, `/:id/no-show`, `/:id/payment-status`, `/therapist/:id` |
| Analytics | `/analytics` | `GET /dashboard`, `GET /revenue` |
| Availability | `/availability` | `PUT/GET /therapist/:id/slots`, `POST/GET /therapist/:id/blockouts`, `DELETE /blockouts/:id` |
| Clinical notes | `/clinical-notes` | `POST/GET /session/:sessionId`, `PUT/DELETE /:id` |

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
