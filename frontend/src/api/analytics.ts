// Analytics API client.

import api from "./api";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SessionCounts {
  completed: number;
  cancelled: number;
  upcoming:  number;
}

export interface MiniSession {
  id:           number;
  patientName:  string;
  patientNumber?: string;
  therapistName: string;
  startTime:    string;
  durationMins: number;
}

export interface TherapistUtilisation {
  id:               number;
  name:             string;
  sessionsThisWeek: number;
}

export interface ReferralSource {
  source: string;
  count:  number;
}

export interface DashboardStats {
  totalActivePatients:   number;
  newPatientsThisMonth:  number;
  sessionsThisWeek:      SessionCounts;
  sessionsThisMonth:     SessionCounts;
  revenueThisMonth:      number;
  revenueLastMonth:      number;
  upcomingToday:         MiniSession[];
  upcomingThisWeekCount: number;
  therapistUtilisation:  TherapistUtilisation[];
  referralSources:       ReferralSource[];
}

export interface MonthlyRevenue {
  month:        string;  // "2026-01"
  revenue:      number;
  sessionCount: number;
}

export interface TherapistRevenue {
  id:           number;
  name:         string;
  revenue:      number;
  sessionCount: number;
}

export interface RevenueStats {
  monthlyRevenue:          MonthlyRevenue[];
  revenueByTherapist:      TherapistRevenue[];
  outstandingSessions:     MiniSession[];
  totalRevenue:            number;
  totalCompletedSessions:  number;
  averageChargePerSession: number;
}

// ── API functions ──────────────────────────────────────────────────────────────

export async function getDashboardStats(): Promise<DashboardStats> {
  const res = await api.get("/analytics/dashboard");
  return res.data.data.stats;
}

export async function getRevenueStats(): Promise<RevenueStats> {
  const res = await api.get("/analytics/revenue");
  return res.data.data.stats;
}
