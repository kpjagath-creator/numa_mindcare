import api from "./api";

export type ClinicalNoteStatus = "draft" | "signed";

export interface ClinicalNoteAmendment {
  id: number;
  clinicalNoteId: number;
  content: string;
  createdByName: string;
  createdAt: string;
}

export interface ClinicalNote {
  id: number;
  sessionId: number;
  content: string;
  createdByName: string;
  status: ClinicalNoteStatus;
  signedAt: string | null;
  signedByName: string | null;
  createdAt: string;
  updatedAt: string;
  amendments: ClinicalNoteAmendment[];
}

export async function getNotesForSession(sessionId: number): Promise<ClinicalNote[]> {
  const res = await api.get(`/clinical-notes/session/${sessionId}`);
  return res.data.data.notes;
}
export async function createNote(sessionId: number, content: string, created_by_name: string): Promise<ClinicalNote> {
  const res = await api.post(`/clinical-notes/session/${sessionId}`, { content, created_by_name });
  return res.data.data.note;
}
export async function updateNote(id: number, content: string): Promise<ClinicalNote> {
  const res = await api.put(`/clinical-notes/${id}`, { content });
  return res.data.data.note;
}
export async function deleteNote(id: number): Promise<void> {
  await api.delete(`/clinical-notes/${id}`);
}
export async function signNote(id: number, signed_by_name: string): Promise<ClinicalNote> {
  const res = await api.patch(`/clinical-notes/${id}/sign`, { signed_by_name });
  return res.data.data.note;
}
export async function addAmendment(id: number, content: string, created_by_name: string): Promise<ClinicalNote> {
  const res = await api.post(`/clinical-notes/${id}/amendments`, { content, created_by_name });
  return res.data.data.note;
}
