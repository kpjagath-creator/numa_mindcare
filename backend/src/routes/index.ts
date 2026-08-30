// Aggregator router for API version 1.

import { Router } from "express";
import patientsRouter from "./patients";
import teamMembersRouter from "./teamMembers";
import therapySessionsRouter from "./therapySessions";
import analyticsRouter from "./analytics";
import availabilityRouter from "./availability";
import clinicalNotesRouter from "./clinicalNotes";
import authRouter from "./auth";
import { requireAuth } from "../middleware/requireAuth";

const v1Router = Router();

// /auth is the only public resource group (login must be reachable while
// unauthenticated; the other /auth routes enforce requireAuth themselves).
v1Router.use("/auth", authRouter);

// Everything below requires an established session.
v1Router.use(requireAuth);

v1Router.use("/patients", patientsRouter);
v1Router.use("/team-members", teamMembersRouter);
v1Router.use("/therapy-sessions", therapySessionsRouter);
v1Router.use("/analytics", analyticsRouter);
v1Router.use("/availability", availabilityRouter);
v1Router.use("/clinical-notes", clinicalNotesRouter);

export default v1Router;
