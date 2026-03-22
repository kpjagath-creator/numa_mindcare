import api from "./api";

export interface ClinicalNote { id: number; sessionId: number; content: string; createdByName: string; createdAt: string; updatedAt: string; }

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
