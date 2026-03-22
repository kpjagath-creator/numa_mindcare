// Route definitions for the /availability resource group under /api/v1.

import { Router } from "express";
import {
  setAvailability,
  getAvailability,
  createBlockout,
  getBlockouts,
  deleteBlockout,
} from "../controllers/availabilityController";

const router = Router();

router.put("/therapist/:id/slots", setAvailability);
router.get("/therapist/:id/slots", getAvailability);
router.post("/therapist/:id/blockouts", createBlockout);
router.get("/therapist/:id/blockouts", getBlockouts);
router.delete("/blockouts/:id", deleteBlockout);

export default router;
