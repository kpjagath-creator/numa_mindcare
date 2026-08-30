// Route definitions for the /patients resource group under /api/v1.

import { Router } from "express";
import {
  registerPatient,
  listPatients,
  getPatient,
  updateStatus,
  updateTherapist,
  updatePatientInfo,
  deletePatient,
  getStatusLogs,
  getTimeline,
} from "../controllers/patientsController";
import { requirePermission } from "../middleware/requirePermission";

const router = Router();

router.post("/", requirePermission("patients:create"), registerPatient);
router.get("/", requirePermission("patients:read"), listPatients);
router.get("/:id", requirePermission("patients:read"), getPatient);
router.put("/:id", requirePermission("patients:update"), updatePatientInfo);
router.patch("/:id/status", requirePermission("patients:update"), updateStatus);
router.patch("/:id/therapist", requirePermission("patients:update"), updateTherapist);
router.delete("/:id", requirePermission("patients:delete"), deletePatient);
router.get("/:id/status-logs", requirePermission("patients:read"), getStatusLogs);
router.get("/:id/timeline", requirePermission("patients:read"), getTimeline);

export default router;
