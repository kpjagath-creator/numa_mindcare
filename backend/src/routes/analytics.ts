// Analytics routes — mounted at /api/v1/analytics.

import { Router } from "express";
import { dashboardStats, revenueStats } from "../controllers/analyticsController";

const router = Router();

router.get("/dashboard", dashboardStats);
router.get("/revenue",   revenueStats);

export default router;
