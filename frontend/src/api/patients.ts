// API calls for the /patients resource.

import api from "./api";
import type { Patient, PatientStatusLog, PaginationMeta } from "../types/index";

export interface CreatePatientPayload {
  name: string;
  mobile: string;
  email: string;
  age: number;
  source?: string;
  referred_by?: string;
  therapist_id?: number;
}

export interface UpdateStatusPayload {
  new_status: string;
  changed_by_name: string;
  notes?: string;
}

export interface UpdateTherapistPayload {
  therapist_id: number | null;
  changed_by_name: string;
}

export interface ListPatientsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}

export interface ListPatientsResponse {
  patients: Patient[];
  pagination: PaginationMeta;
}

export async function createPatient(payload: CreatePatientPayload): Promise<Patient> {
  const res = await api.post<{ success: true; data: { patient: Patient } }>("/patients", payload);
  return res.data.data.patient;
}

export async function listPatients(params?: ListPatientsParams): Promise<ListPatientsResponse> {
  const res = await api.get<{ success: true; data: { patients: Patient[] }; pagination: PaginationMeta }>(
    "/patients", { params }
  );
  return { patients: res.data.data.patients, pagination: res.data.pagination };
}

export async function getPatient(id: number): Promise<Patient> {
  const res = await api.get<{ success: true; data: { patient: Patient } }>(`/patients/${id}`);
  return res.data.data.patient;
}

export async function updatePatientStatus(id: number, payload: UpdateStatusPayload): Promise<Patient> {
  const res = await api.patch<{ success: true; data: { patient: Patient } }>(`/patients/${id}/status`, payload);
  return res.data.data.patient;
}

export async function updatePatientTherapist(id: number, payload: UpdateTherapistPayload): Promise<Patient> {
  const res = await api.patch<{ success: true; data: { patient: Patient } }>(`/patients/${id}/therapist`, payload);
  return res.data.data.patient;
}

export async function deletePatient(id: number): Promise<void> {
  await api.delete(`/patients/${id}`);
}

export async function getStatusLogs(id: number): Promise<PatientStatusLog[]> {
  const res = await api.get<{ success: true; data: { logs: PatientStatusLog[] } }>(`/patients/${id}/status-logs`);
  return res.data.data.logs;
}

export interface UpdatePatientInfoPayload {
  name?: string;
  mobile?: string;
  email?: string;
  age?: number;
  source?: string | null;
  referred_by?: string | null;
}

export async function updatePatientInfo(id: number, payload: UpdatePatientInfoPayload): Promise<Patient> {
  const res = await api.put<{ success: true; data: { patient: Patient } }>(`/patients/${id}`, payload);
  return res.data.data.patient;
}
