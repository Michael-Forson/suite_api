import { Router } from "express";
import {
  requireRootSuperAdmin,
  superAdminAuthenticate,
} from "../../../middleware/super-admin/superAdminAuth.middleware.js";
import {
  changeSuperAdminStatus,
  inviteSuperAdmin,
  listSuperAdmins,
  resendSuperAdminInvite,
  sendSuperAdminPasswordReset,
  updateSuperAdmin,
} from "./account.controller.js";

const router = Router();

router.use(superAdminAuthenticate);

// Readable by every super-admin — the console shows the list to everyone and
// hides the actions it cannot use.
router.get("/", listSuperAdmins);

// Managing other accounts belongs to the root super-admin (the holder of
// SUPER_ADMIN_EMAIL) alone. Creates an INVITED account and mails a
// set-your-own-password link; no password is accepted here.
router.post("/", requireRootSuperAdmin, inviteSuperAdmin);
router.post(
  "/:superAdminId/resend-invite",
  requireRootSuperAdmin,
  resendSuperAdminInvite,
);
router.post(
  "/:superAdminId/send-password-reset",
  requireRootSuperAdmin,
  sendSuperAdminPasswordReset,
);
router.patch("/:superAdminId/status", requireRootSuperAdmin, changeSuperAdminStatus);

// Not root-gated: the controller allows anyone to edit their own profile and
// only root to edit someone else's.
router.patch("/:superAdminId", updateSuperAdmin);

export default router;
