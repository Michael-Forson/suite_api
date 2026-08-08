import { Router } from "express";
import {
  emailLimiter,
  loginLimiter,
  verifyCodeLimiter,
} from "../../../middleware/common/rateLimiter.middleware.js";
import { superAdminAuthenticate } from "../../../middleware/super-admin/superAdminAuth.middleware.js";
import {
  getSuperAdminProfile,
  loginSuperAdmin,
  refreshSuperAdminToken,
} from "./super_admin_auth.controller.js";
import {
  getSuperAdminPasswordToken,
  requestSuperAdminPasswordReset,
  setSuperAdminPassword,
} from "./super_admin_password.controller.js";

const router = Router();

router.post("/login", loginLimiter, loginSuperAdmin);
router.post("/refresh", loginLimiter, refreshSuperAdminToken);
router.get("/me", superAdminAuthenticate, getSuperAdminProfile);

/**
 * Public, and rate limited accordingly: `/forgot` mails a link to an address
 * anyone can guess, and the token routes are the one path that sets a password
 * without an existing session.
 */
router.post("/password/forgot", emailLimiter, requestSuperAdminPasswordReset);
router.get("/password/token/:token", verifyCodeLimiter, getSuperAdminPasswordToken);
router.post("/password/set", verifyCodeLimiter, setSuperAdminPassword);

export default router;
