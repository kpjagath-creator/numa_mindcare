// All domain-level TypeScript types for the Numa Mindcare platform.

// ── Patient status ─────────────────────────────────────────────────────────────

export const PATIENT_STATUSES = [
  "created",
  "discovery_scheduled",
  "discovery_completed",
  "started_therapy",
  "therapy_paused",
  "schedule_completed",
  "patient_dropped",
] as const;

export type PatientStatus = (typeof PATIENT_STATUSES)[number];

// ── Domain interfaces ──────────────────────────────────────────────────────────

export interface TherapistSummary {
  id: number;
  name: string;
  employeeType: string;
  employeeCode: string;
}

export interface Patient {
  id: number;
  patientNumber: string;
  name: string;
  mobile: string;
  email: string;
  age: number;
  source: string | null;
  referredBy: string | null;
  currentStatus: PatientStatus;
  therapistId: number | null;
  therapist: TherapistSummary | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PatientStatusLog {
  id: number;
  patientId: number;
  previousStatus: string | null;
  newStatus: string;
  changedByName: string | null;
  changedByUserId: number | null;
  notes: string | null;
  createdAt: Date;
}

// ── Pagination ─────────────────────────────────────────────────────────────────

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: PaginationMeta;
}

// ── Team member ────────────────────────────────────────────────────────────────

export const EMPLOYEE_TYPES = ["psychologist", "psychiatrist"] as const;
export type EmployeeType = (typeof EMPLOYEE_TYPES)[number];

export interface TeamMember {
  id: number;
  employeeCode: string;
  name: string;
  employeeType: EmployeeType;
  // Nullable: therapist records created before MEET-01 have no email.
  email: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Email is required on new onboarding (enforced in teamMemberValidators). The column is
// nullable so pre-existing therapist records without one keep working - see UpdateTeamMemberInput.
export interface CreateTeamMemberInput {
  name: string;
  employee_type: EmployeeType;
  email: string;
}

// Therapist update (MEET-01). Every field optional - a partial update, mirroring
// UpdatePatientInfoInput. `email` is what lets an admin add an address to a pre-existing
// therapist record that has none.
export interface UpdateTeamMemberInput {
  name?: string;
  employee_type?: EmployeeType;
  email?: string;
  is_active?: boolean;
}

// ── Service input types ────────────────────────────────────────────────────────

export interface CreatePatientInput {
  name: string;
  mobile: string;
  email: string;
  age: number;
  source?: string;
  referred_by?: string;
  therapist_id?: number;
}

export interface UpdateStatusInput {
  new_status: PatientStatus;
  changed_by_name: string;
  notes?: string;
}

export interface UpdateTherapistInput {
  therapist_id: number | null;
  changed_by_name: string;
}

// ── Therapy session ────────────────────────────────────────────────────────────

export interface SessionParticipant {
  id: number;
  name: string;
  patientNumber?: string;
  employeeType?: string;
}

export type SessionStatus = "upcoming" | "completed" | "cancelled" | "no_show" | "rescheduled";
export type PaymentStatus = "unpaid" | "paid" | "partial";

export type SessionType = "therapy" | "discovery";

// Google Calendar / Meet integration (MEET-01). Conceptual state of the external calendar
// event that represents a session. A null column value means no meeting was ever attempted
// (sessions created before this feature); CANCELLED means the external event is gone; CANCEL_FAILED
// means the external event is still live and Numa could not remove it (MEET-02) - the event id is
// retained and the cancellation is retryable from the session UI.
export const MEETING_STATUSES = ["PENDING", "ACTIVE", "FAILED", "CANCELLED", "CANCEL_FAILED"] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export interface TherapySession {
  id: number;
  patientId: number;
  patient: SessionParticipant;
  teamMemberId: number;
  therapist: SessionParticipant;
  startTime: Date;
  endTime: Date;
  durationMins: number;
  sessionType: SessionType;
  status: SessionStatus;
  cancelReason: string | null;
  charges: number | null;
  paymentStatus: PaymentStatus;
  noShowFee: number | null;
  rescheduledFromId: number | null;
  notes: string | null;
  // Google Calendar / Meet integration state (MEET-01). Null across the board on sessions
  // that predate the feature, or where provisioning was never attempted.
  meetingProvider: string | null;
  googleEventId: string | null;
  meetingLink: string | null;
  meetingStatus: MeetingStatus | null;
  meetingError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSessionInput {
  patient_id: number;
  therapist_id: number;
  session_date: string;   // YYYY-MM-DD
  start_time: string;     // HH:MM
  duration_mins: number;
  session_type?: SessionType;
  notes?: string;
}

export interface CancelSessionInput {
  reason: string;
}

export interface CompleteSessionInput {
  charges?: number;
  notes?: string;
}

export interface RescheduleSessionInput {
  session_date: string;  // YYYY-MM-DD
  start_time: string;    // HH:MM
  duration_mins: number;
  notes?: string;
}

export interface NoShowSessionInput {
  no_show_fee?: number;
}

export interface UpdatePaymentStatusInput {
  payment_status: PaymentStatus;
  changed_by_name: string;
}

export interface UpdatePatientInfoInput {
  name?: string;
  mobile?: string;
  email?: string;
  age?: number;
  source?: string | null;
  referred_by?: string | null;
}

export interface ListSessionsQuery {
  page: number;
  limit: number;
  patient_id?: number;
  therapist_id?: number;
  date?: string;
  status?: SessionStatus;
}

export interface ListPatientsQuery {
  page: number;
  limit: number;
  search?: string;
  status?: PatientStatus;
}

// ── Therapist availability ─────────────────────────────────────────────────────

export interface TherapistAvailabilitySlot {
  id: number;
  teamMemberId: number;
  dayOfWeek: number;  // 0=Sun, 1=Mon ... 6=Sat
  startTime: string;  // "09:00"
  endTime: string;    // "18:00"
}

export interface SetAvailabilityInput {
  slots: { day_of_week: number; start_time: string; end_time: string }[];
}

export interface CreateBlockoutInput {
  block_date: string;  // YYYY-MM-DD
  reason?: string;
}

export interface TherapistBlockoutEntry {
  id: number;
  teamMemberId: number;
  blockDate: Date;
  reason: string | null;
}

// ── Clinical notes (CLN-07: sign-off / immutability) ───────────────────────────

export type ClinicalNoteStatus = "draft" | "signed";

export interface ClinicalNoteAmendment {
  id: number;
  clinicalNoteId: number;
  content: string;
  createdByName: string;
  createdAt: Date;
}

export interface ClinicalNote {
  id: number;
  sessionId: number;
  content: string;
  createdByName: string;
  status: ClinicalNoteStatus;
  signedAt: Date | null;
  signedByName: string | null;
  createdAt: Date;
  updatedAt: Date;
  amendments: ClinicalNoteAmendment[];
}

export interface CreateClinicalNoteInput {
  content: string;
  created_by_name: string;
}

export interface UpdateClinicalNoteInput {
  content: string;
}

export interface SignClinicalNoteInput {
  signed_by_name: string;
}

export interface AddClinicalNoteAmendmentInput {
  content: string;
  created_by_name: string;
}

// ── Patient timeline (PAT-10) ───────────────────────────────────────────────────

export type PatientTimelineEntryType = "lifecycle" | "assignment" | "payment" | "session" | "clinical_note";

export interface PatientTimelineEntry {
  id: string;
  type: PatientTimelineEntryType;
  timestamp: Date;
  actor: string | null;
  description: string;
  link: { resource: string; id: number; sessionId?: number } | null;
}
