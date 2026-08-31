# CLAUDE.md

Instructions for Claude Code (or any agent) working in this repo. Read this first; go deeper into `context.md` (component-level dev reference) and `PROJECT_MEMORY.md` (dated history/architecture log) as needed. See `SPEC.md` for the product/feature spec.

## What this is

Numa MindCare — internal practice-management web app for a single therapy/mental-health clinic (no multi-tenancy). React/Vite/TS frontend, Node/Express/TS/Prisma backend, PostgreSQL on Supabase. Deployed: frontend on Vercel (`numa-mindcare.vercel.app`), backend on Render (`numa-mindcare.onrender.com`).

## Stack quick reference

- Frontend: React 18 + Vite 5 + TS 5, react-router-dom v6, axios. No UI framework — inline `style` objects only. No global state — `useState` + prop drilling.
- Backend: Express 4 + TS, Prisma 5, Zod validation. Controllers are thin; all business logic lives in `backend/src/services/*.ts`.
- Local ports: backend `:3001`, frontend `:5173` (Vite proxies `/api/v1` → `:3001` in dev).
- Local dev: `cd backend && npm run dev` / `cd frontend && npm run dev`. Backend needs `.env` with `DATABASE_URL` and `JWT_SECRET` (throws at import time if `JWT_SECRET` unset).

## Hard rules — do not violate

1. **`sessionType` ("therapy" | "discovery") must be explicitly set on every code path that creates or copies a `TherapySession`** (create, reschedule, seed). The Prisma default silently falls back to `"therapy"` and breaks discovery-call workflow/status auto-advance. This has caused most historical bugs — see `context.md` §9.
2. **`PatientProfilePage.tsx` and `ScheduleListPage.tsx` have separate mobile and desktop JSX branches, not separate routes.** Any new UI (buttons, modals, badges) must be added to both branches.
3. **Never run `backend/prisma/seed.ts` against production.** It creates 10 demo team members/patients/sessions in addition to the bootstrap admin. Production admin creation was done with a one-off script that duplicated only the idempotent admin-create block.
4. **`DATABASE_URL` must use Supabase's session pooler** (`...pooler.supabase.com:5432`, no `pgbouncer` param) — not the direct host (IPv6-only, unreachable from Render) and not the transaction pooler on `:6543` (breaks Prisma prepared statements).
5. **Render Free plan does not run `preDeployCommand`.** Despite `render.yaml` declaring `npx prisma migrate deploy`, every schema migration must be applied manually: run `prisma migrate deploy` locally against the production `DATABASE_URL` before/after pushing the migration.
6. **Vercel's dashboard-level env vars override the committed `.env.production` file at build time and do not auto-sync from the repo.** If the deployed frontend calls the wrong backend URL, check the dashboard value first.
7. **RBAC is centralized** in `backend/src/auth/permissions.ts` (Role→Permission map, `resource:action` strings). Routes declare `requirePermission("...")`. Never add a scattered `role === "admin"` check — add a role by adding a key to `ROLE_PERMISSIONS`.
8. **Don't store or print the production admin password** in code, commits, or docs.
9. Design tokens: primary teal `#3D9E8E`, sand background `#F7F2EC`, revenue green `#16A34A`, status colors (purple = no-show, red = dropped). Don't reintroduce older tokens (`#2d6b5f`, `#1A7A6E`, `#1a2535`).
10. `backend/.env`'s `DATABASE_URL` points at a local Postgres database (`numa_test`) — this is a disposable local dev/test database, not production. `backend/src/services/__tests__/*.integration.test.ts` runs real queries against it (wiping/reseeding its own tables per test) to verify things an in-memory Prisma double can't prove, e.g. Postgres `EXCLUDE` constraint / compare-and-swap concurrency behavior — they skip gracefully if it isn't reachable. `vitest.config.ts` sets `fileParallelism: false` so these files don't race each other on shared tables. Never point this at Supabase production.
11. **The Google Calendar OAuth app must stay published "In production".** The Meet integration (MEET-01) authenticates as a dedicated *consumer* Gmail account via an OAuth refresh token — a service account cannot do this job (Meet conference creation and attendee invitations require domain-wide delegation, which requires Google Workspace). While the Cloud Console OAuth app sits in **"Testing"** publishing status, Google expires refresh tokens after **7 days** and every session's meeting generation starts failing with `invalid_grant`. Full Google verification is *not* required for one account — an unverified production app works. If meetings suddenly stop generating, check the publishing status before anything else. Credentials live only in Render env vars (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`); never commit or log them.

## Where things live

| Need to touch | File |
|---|---|
| Session create/complete/reschedule/cancel logic + status auto-advance + booking concurrency/availability | `backend/src/services/therapySessionsService.ts` |
| Google Calendar/Meet integration policy (idempotency, failure state, attendees) | `backend/src/services/sessionMeetingService.ts` |
| Google Calendar HTTP/OAuth surface (the only file that knows Google exists) | `backend/src/services/googleCalendarService.ts` |
| Google Meet UI (link / Copy Link / Retry — shared by desktop + mobile) | `frontend/src/components/schedule/SessionMeetingCell.tsx` |
| Clinical note sign-off/amendments | `backend/src/services/clinicalNotesService.ts` |
| Patient timeline composition (PAT-10) | `backend/src/services/patientTimelineService.ts` |
| RBAC permission map | `backend/src/auth/permissions.ts` |
| JWT/session cookie config | `backend/src/auth/jwt.ts`, `backend/src/auth/cookies.ts` |
| Auth middleware | `backend/src/middleware/requireAuth.ts` |
| Patient status constants/transitions | `frontend/src/constants/statuses.ts` |
| Auth context / route guard | `frontend/src/auth/AuthContext.tsx`, `frontend/src/components/auth/ProtectedRoute.tsx` |
| Axios instance / base URL | `frontend/src/api/api.ts` |
| Frontend↔backend proxy (prod) | `frontend/vercel.json` |
| Prisma schema | `backend/prisma/schema.prisma` |
| Render deploy config | `render.yaml` |

## Deployment

Push to `main` → Render auto-deploys backend (`rootDir: backend`), Vercel auto-deploys frontend. Frontend calls the backend via a Vercel rewrite proxy (`/api/*` → Render), not directly — this keeps the session cookie first-party (required for Chrome Incognito / Safari / Brave / Firefox-strict, which block third-party cookies). See `PROJECT_MEMORY.md` §8c for the full incident writeup. Do not change `frontend/.env.production`'s `VITE_API_URL` back to an absolute Render URL — it must stay `/api/v1`.

## When you finish a significant change

Update `PROJECT_MEMORY.md` with a new dated section (pattern: `## Ne. <title> (YYYY-MM-DD)`) describing the bug/feature, root cause if applicable, and exact fix locations. This is the project's standing documentation convention — keep it current rather than letting knowledge live only in commit messages.

## Don't

- Don't redesign the RBAC/auth architecture unless the user asks for it.
- Don't add a UI framework or global state library — the codebase intentionally uses inline styles and local state.
- Don't run destructive DB operations or migrations against production without confirming with the user first (see global safety rules).
