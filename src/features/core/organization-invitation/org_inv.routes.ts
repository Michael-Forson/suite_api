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

router.post("/:organizationId/invitations", authenticate, createStaffInvitation);
router.get(
  "/:organizationId/invitations/validate/:token",
  validateInvitationToken,
);
router.post("/:organizationId/invitations/accept", authenticate, acceptInvitation);
router.patch(
  "/:organizationId/invitations/expire-old",
  authenticate,
  expireOldInvitations,
);
router.post(
  "/:organizationId/invitations/:invitationId/send-email",
  authenticate,
  sendInvitationEmail,
);
router.patch(
  "/:organizationId/invitations/:invitationId/revoke",
  authenticate,
  revokeInvitation,
);
router.post(
  "/:organizationId/invitations/:invitationId/resend",
  authenticate,
  resendInvitation,
);

export default router;
