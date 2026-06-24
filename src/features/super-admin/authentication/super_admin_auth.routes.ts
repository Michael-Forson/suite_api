import { Router } from "express";
import { loginLimiter } from "../../../middleware/common/rateLimiter.middleware.js";
import { superAdminAuthenticate } from "../../../middleware/super-admin/superAdminAuth.middleware.js";
import {
  getSuperAdminProfile,
  loginSuperAdmin,
  refreshSuperAdminToken,
} from "./super_admin_auth.controller.js";

const router = Router();

router.post("/login", loginLimiter, loginSuperAdmin);
router.post("/refresh", loginLimiter, refreshSuperAdminToken);
router.get("/me", superAdminAuthenticate, getSuperAdminProfile);

export default router;
