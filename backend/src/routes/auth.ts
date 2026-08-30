// Route definitions for /api/v1/auth. Login is the only public endpoint in
// the whole API; everything else here requires an established session.

import { Router } from "express";
import { login, logout, me, changePassword } from "../controllers/authController";
import { requireAuth } from "../middleware/requireAuth";
import { loginRateLimit } from "../middleware/loginRateLimit";

const router = Router();

router.post("/login", loginRateLimit, login);
router.post("/logout", logout);
router.get("/me", requireAuth, me);
router.post("/change-password", requireAuth, changePassword);

export default router;
