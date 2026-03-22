// API calls for /therapy-sessions.

import api from "./api";
import type { TherapySession, PaginationMeta } from "../types/index";

export interface CreateSessionPayload {
  patient_id: number;
  therapist_id: number;
  session_date: string;
  start_time: string;
  duration_mins: number;
  notes?: string;
}

export interface ListSessionsParams {
  page?: number;
  limit?: number;
  patient_id?: number;
  therapist_id?: number;
  date?: string;
  status?: "upcoming" | "completed" | "cancelled" | "no_show" | "rescheduled";
}

export interface ListSessionsResponse {
  sessions: TherapySession[];
  pagination: PaginationMeta;
}

export async function createSession(payload: CreateSessionPayload): Promise<TherapySession> {
  const res = await api.post<{ success: true; data: { session: TherapySession } }>("/therapy-sessions", payload);
  return res.data.data.session;
}

export async function listSessions(params?: ListSessionsParams): Promise<ListSessionsResponse> {
  const res = await api.get<{ success: true; data: { sessions: TherapySession[] }; pagination: PaginationMeta }>(
    "/therapy-sessions", { params }
  );
  return { sessions: res.data.data.sessions, pagination: res.data.pagination };
}

export async function cancelSession(id: number, reason: string): Promise<TherapySession> {
  const res = await api.patch<{ success: true; data: { session: TherapySession } }>(
    `/therapy-sessions/${id}/cancel`, { reason }
  );
  return res.data.data.session;
}

export async function completeSession(id: number, charges?: number): Promise<TherapySession> {
  const res = await api.patch<{ success: true; data: { session: TherapySession } }>(
    `/therapy-sessions/${id}/complete`,
    charges !== undefined ? { charges } : {}
  );
  return res.data.data.session;
}

export async function deleteSession(id: number): Promise<void> {
  await api.delete(`/therapy-sessions/${id}`);
}

export async function getTherapistSessions(therapistId: number, date?: string): Promise<TherapySession[]> {
  const res = await api.get<{ success: true; data: { sessions: TherapySession[] } }>(
    `/therapy-sessions/therapist/${therapistId}`,
    { params: date ? { date } : undefined }
  );
  return res.data.data.sessions;
}

export async function rescheduleSession(id: number, payload: { session_date: string; start_time: string; duration_mins: number; notes?: string }): Promise<TherapySession> {
  const res = await api.post(`/therapy-sessions/${id}/reschedule`, payload);
  return res.data.data.session;
}

export async function markNoShow(id: number, no_show_fee?: number): Promise<TherapySession> {
  const res = await api.patch(`/therapy-sessions/${id}/no-show`, { no_show_fee });
  return res.data.data.session;
}

export async function updatePaymentStatus(id: number, payment_status: string, changed_by_name: string): Promise<TherapySession> {
  const res = await api.patch(`/therapy-sessions/${id}/payment-status`, { payment_status, changed_by_name });
  return res.data.data.session;
}
