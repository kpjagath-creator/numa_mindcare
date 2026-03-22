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
} from "../controllers/patientsController";

const router = Router();

router.post("/", registerPatient);
router.get("/", listPatients);
router.get("/:id", getPatient);
router.put("/:id", updatePatientInfo);
router.patch("/:id/status", updateStatus);
router.patch("/:id/therapist", updateTherapist);
router.delete("/:id", deletePatient);
router.get("/:id/status-logs", getStatusLogs);

export default router;
