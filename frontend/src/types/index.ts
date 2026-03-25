// Shared domain types for the Numa Mindcare frontend.

// ── Patient ────────────────────────────────────────────────────────────────────

export type PatientStatus =
  | "created"
  | "discovery_scheduled"
  | "discovery_completed"
  | "started_therapy"
  | "therapy_paused"
  | "schedule_completed"
  | "patient_dropped";

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
  createdAt: string;
  updatedAt: string;
}

export interface PatientStatusLog {
  id: number;
  patientId: number;
  previousStatus: string | null;
  newStatus: string;
  changedByName: string | null;
  notes: string | null;
  createdAt: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
}

// ── Team member ────────────────────────────────────────────────────────────────

export type EmployeeType = "psychologist" | "psychiatrist";

export interface TeamMember {
  id: number;
  employeeCode: string;
  name: string;
  employeeType: EmployeeType;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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
  startTime: string;
  endTime: string;
  durationMins: number;
  sessionType: SessionType;
  status: SessionStatus;
  cancelReason: string | null;
  charges: number | null;
  paymentStatus: PaymentStatus;
  noShowFee: number | null;
  rescheduledFromId: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── API response envelopes ─────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  success: true;
  data: T;
  pagination?: PaginationMeta;
}

export interface ApiError {
  success: false;
  error: { message: string; details?: unknown };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
