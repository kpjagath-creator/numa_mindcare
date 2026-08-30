// Routes for the /therapy-sessions resource group.

import { Router } from "express";
import {
  createSession,
  listSessions,
  getSession,
  cancelSession,
  completeSession,
  deleteSession,
  getTherapistSessions,
  rescheduleSession,
  markNoShow,
  updatePaymentStatus,
} from "../controllers/therapySessionsController";
import { requirePermission } from "../middleware/requirePermission";

const router = Router();

router.post("/", requirePermission("sessions:create"), createSession);
router.get("/", requirePermission("sessions:read"), listSessions);
router.get("/therapist/:id", requirePermission("sessions:read"), getTherapistSessions); // must be before /:id
router.get("/:id", requirePermission("sessions:read"), getSession);
router.patch("/:id/cancel", requirePermission("sessions:update"), cancelSession);
router.patch("/:id/complete", requirePermission("sessions:update"), completeSession);
router.post("/:id/reschedule", requirePermission("sessions:update"), rescheduleSession);
router.patch("/:id/no-show", requirePermission("sessions:update"), markNoShow);
router.patch("/:id/payment-status", requirePermission("billing:update"), updatePaymentStatus);
router.delete("/:id", requirePermission("sessions:delete"), deleteSession);

export default router;
