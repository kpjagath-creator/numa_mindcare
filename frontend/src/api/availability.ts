import api from "./api";

export interface AvailabilitySlot { id: number; teamMemberId: number; dayOfWeek: number; startTime: string; endTime: string; }
export interface BlockoutEntry { id: number; teamMemberId: number; blockDate: string; reason: string | null; }

export async function getAvailability(therapistId: number): Promise<AvailabilitySlot[]> {
  const res = await api.get(`/availability/therapist/${therapistId}/slots`);
  return res.data.data.slots;
}
export async function setAvailability(therapistId: number, slots: { day_of_week: number; start_time: string; end_time: string }[]): Promise<AvailabilitySlot[]> {
  const res = await api.put(`/availability/therapist/${therapistId}/slots`, { slots });
  return res.data.data.slots;
}
export async function getBlockouts(therapistId: number): Promise<BlockoutEntry[]> {
  const res = await api.get(`/availability/therapist/${therapistId}/blockouts`);
  return res.data.data.blockouts;
}
export async function createBlockout(therapistId: number, block_date: string, reason?: string): Promise<BlockoutEntry> {
  const res = await api.post(`/availability/therapist/${therapistId}/blockouts`, { block_date, reason });
  return res.data.data.blockout;
}
export async function deleteBlockout(id: number): Promise<void> {
  await api.delete(`/availability/blockouts/${id}`);
}
