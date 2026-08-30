// Analytics routes — mounted at /api/v1/analytics.

import { Router } from "express";
import { dashboardStats, revenueStats } from "../controllers/analyticsController";
import { requirePermission } from "../middleware/requirePermission";

const router = Router();

router.get("/dashboard", requirePermission("analytics:read"), dashboardStats);
router.get("/revenue",   requirePermission("analytics:read"), revenueStats);

export default router;
