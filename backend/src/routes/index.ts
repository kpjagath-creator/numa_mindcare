// Aggregator router for API version 1.

import { Router } from "express";
import patientsRouter from "./patients";
import teamMembersRouter from "./teamMembers";
import therapySessionsRouter from "./therapySessions";
import analyticsRouter from "./analytics";
import availabilityRouter from "./availability";
import clinicalNotesRouter from "./clinicalNotes";

const v1Router = Router();

v1Router.use("/patients", patientsRouter);
v1Router.use("/team-members", teamMembersRouter);
v1Router.use("/therapy-sessions", therapySessionsRouter);
v1Router.use("/analytics", analyticsRouter);
v1Router.use("/availability", availabilityRouter);
v1Router.use("/clinical-notes", clinicalNotesRouter);

export default v1Router;
