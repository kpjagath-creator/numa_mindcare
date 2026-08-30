// Loads backend/.env before anything else runs. Must be the first import in
// app.ts — modules like auth/jwt.ts read process.env at import time, and
// import statements are evaluated before the rest of a module's body, so
// calling dotenv.config() from inside app.ts itself would run too late.

import dotenv from "dotenv";
dotenv.config();
