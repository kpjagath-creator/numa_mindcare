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

const router = Router();

router.post("/", createSession);
router.get("/", listSessions);
router.get("/therapist/:id", getTherapistSessions); // must be before /:id
router.get("/:id", getSession);
router.patch("/:id/cancel", cancelSession);
router.patch("/:id/complete", completeSession);
router.post("/:id/reschedule", rescheduleSession);
router.patch("/:id/no-show", markNoShow);
router.patch("/:id/payment-status", updatePaymentStatus);
router.delete("/:id", deleteSession);

export default router;
