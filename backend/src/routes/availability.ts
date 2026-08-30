// Route definitions for the /availability resource group under /api/v1.

import { Router } from "express";
import {
  setAvailability,
  getAvailability,
  createBlockout,
  getBlockouts,
  deleteBlockout,
} from "../controllers/availabilityController";
import { requirePermission } from "../middleware/requirePermission";

const router = Router();

router.put("/therapist/:id/slots", requirePermission("availability:manage"), setAvailability);
router.get("/therapist/:id/slots", requirePermission("availability:read"), getAvailability);
router.post("/therapist/:id/blockouts", requirePermission("availability:manage"), createBlockout);
router.get("/therapist/:id/blockouts", requirePermission("availability:read"), getBlockouts);
router.delete("/blockouts/:id", requirePermission("availability:manage"), deleteBlockout);

export default router;
