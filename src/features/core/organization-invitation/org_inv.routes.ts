import { Router } from "express";
import { authenticate } from "../../../middleware/users/auth.middleware.js";
import {
  acceptInvitation,
  createStaffInvitation,
  expireOldInvitations,
  resendInvitation,
  revokeInvitation,
  sendInvitationEmail,
  validateInvitationToken,
} from "./org_inv.controller.js";

const router = Router();

router.post("/:organizationId/invites", authenticate, createStaffInvitation);
router.get("/:organizationId/invites/validate/:token", validateInvitationToken);
router.post("/:organizationId/invites/accept", authenticate, acceptInvitation);
router.patch(
  "/:organizationId/invites/expire-old",
  authenticate,
  expireOldInvitations,
);
router.post(
  "/:organizationId/invites/:invitationId/send-email",
  authenticate,
  sendInvitationEmail,
);
router.patch(
  "/:organizationId/invites/:invitationId/revoke",
  authenticate,
  revokeInvitation,
);
router.post(
  "/:organizationId/invites/:invitationId/resend",
  authenticate,
  resendInvitation,
);

export default router;
