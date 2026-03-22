// Analytics controller — thin HTTP layer over analyticsService.

import { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../utils/responseHelper";
import { getDashboardStats, getRevenueStats } from "../services/analyticsService";

export async function dashboardStats(_req: Request, res: Response, next: NextFunction) {
  try {
    const stats = await getDashboardStats();
    sendSuccess(res, { stats });
  } catch (err) {
    next(err);
  }
}

export async function revenueStats(_req: Request, res: Response, next: NextFunction) {
  try {
    const stats = await getRevenueStats();
    sendSuccess(res, { stats });
  } catch (err) {
    next(err);
  }
}
