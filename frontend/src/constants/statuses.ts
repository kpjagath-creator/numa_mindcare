// Patient status definitions and transition map.

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

// Workflow transitions:
// created → discovery_scheduled  (auto: scheduling a discovery call)
// discovery_scheduled → discovery_completed  (auto: completing the discovery session)
// discovery_completed → started_therapy  (auto: scheduling first therapy session)
// started_therapy → schedule_completed | therapy_paused | patient_dropped  (manual, from patient profile)
// therapy_paused → started_therapy | patient_dropped  (manual)
// schedule_completed / patient_dropped → terminal states
export const STATUS_TRANSITIONS: Record<PatientStatus, PatientStatus[]> = {
  created: [],                          // transitions via scheduling a discovery call
  discovery_scheduled: [],              // transitions via completing the discovery session
  discovery_completed: [],              // transitions via scheduling first therapy session
  started_therapy: ["schedule_completed", "therapy_paused", "patient_dropped"],
  therapy_paused: ["started_therapy", "patient_dropped"],
  schedule_completed: [],
  patient_dropped: [],
};

// Human-readable hint for what triggers the next automatic transition
export const STATUS_NEXT_ACTION_HINT: Partial<Record<PatientStatus, string>> = {
  created: "Schedule a discovery call to move this patient forward.",
  discovery_scheduled: "Complete the discovery session to advance to Discovery Completed.",
  discovery_completed: "Assign a therapist/psychiatrist via Edit Info, then schedule the first therapy session to move to Started Therapy.",
};
