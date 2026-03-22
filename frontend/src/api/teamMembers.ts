// API calls for the /team-members resource.

import api from "./api";
import type { TeamMember, Patient } from "../types/index";

export interface CreateTeamMemberPayload {
  name: string;
  employee_type: "psychologist" | "psychiatrist";
}

export async function createTeamMember(payload: CreateTeamMemberPayload): Promise<TeamMember> {
  const res = await api.post<{ success: true; data: { member: TeamMember } }>("/team-members", payload);
  return res.data.data.member;
}

export async function listTeamMembers(): Promise<TeamMember[]> {
  const res = await api.get<{ success: true; data: { members: TeamMember[] } }>("/team-members");
  return res.data.data.members;
}

export async function getTeamMember(id: number): Promise<TeamMember> {
  const res = await api.get<{ success: true; data: { member: TeamMember } }>(`/team-members/${id}`);
  return res.data.data.member;
}

export async function deleteTeamMember(id: number): Promise<void> {
  await api.delete(`/team-members/${id}`);
}

export async function getTeamMemberPatients(id: number): Promise<Patient[]> {
  const res = await api.get<{ success: true; data: { patients: Patient[] } }>(`/team-members/${id}/patients`);
  return res.data.data.patients;
}
