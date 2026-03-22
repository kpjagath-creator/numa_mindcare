// Patient status definitions and transition map.
// The transition map is stubbed here for Phase 3+ — currently all transitions
// are open (any status → any status). Restrictions will be enforced in a future phase.

import type { PatientStatus } from "../types/index";

export const PATIENT_STATUSES: PatientStatus[] = [
  "created",
  "discovery_scheduled",
  "discovery_completed",
  "started_therapy",
  "therapy_paused",
  "schedule_completed",
  "patient_dropped",
];

export const STATUS_LABELS: Record<PatientStatus, string> = {
  created: "Created",
  discovery_scheduled: "Discovery Scheduled",
  discovery_completed: "Discovery Completed",
  started_therapy: "Started Therapy",
  therapy_paused: "Therapy Paused",
  schedule_completed: "Schedule Completed",
  patient_dropped: "Patient Dropped",
};

// Future: restrict which statuses can follow which.
// For now every status is reachable from every other status.
export const STATUS_TRANSITIONS: Record<PatientStatus, PatientStatus[]> = {
  created: PATIENT_STATUSES,
  discovery_scheduled: PATIENT_STATUSES,
  discovery_completed: PATIENT_STATUSES,
  started_therapy: PATIENT_STATUSES,
  therapy_paused: PATIENT_STATUSES,
  schedule_completed: PATIENT_STATUSES,
  patient_dropped: PATIENT_STATUSES,
};
