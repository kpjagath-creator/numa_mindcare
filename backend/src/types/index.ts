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
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTeamMemberInput {
  name: string;
  employee_type: EmployeeType;
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

// ── Clinical notes ─────────────────────────────────────────────────────────────

export interface ClinicalNote {
  id: number;
  sessionId: number;
  content: string;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateClinicalNoteInput {
  content: string;
  created_by_name: string;
}

export interface UpdateClinicalNoteInput {
  content: string;
}
