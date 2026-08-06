import { Response } from "express";
import asyncHandler from "express-async-handler";
import { SuperAdminStatus } from "../../../generated/prisma/enums.js";
import { SuperAdminAuthRequest } from "../../../middleware/super-admin/superAdminAuth.middleware.js";
import { prisma } from "../../../prisma.js";
import { comparePassword, hashPassword } from "../../../utils/password.js";
import { isUniqueConstraintError } from "../../../utils/prisma.utils.js";
import { isRootSuperAdminEmail } from "../../../utils/rootSuperAdmin.js";
import { isValidEmail } from "../../../utils/validators.js";
import {
  SUPER_ADMIN_SELECT,
  serializeSuperAdmin,
} from "../authentication/super_admin_auth.helpers.js";
import {
  deliverSuperAdminInvite,
  deliverSuperAdminPasswordReset,
  isSuperAdminStatus,
  isValidSuperAdminPassword,
  normalizeText,
  parseSuperAdminId,
  updateStatusSafely,
} from "./account.helpers.js";

/**
 * Invites a super-admin. No password is ever set here — the account lands in
 * INVITED with a null password and an emailed link, and only the invitee's own
 * submission on that link turns it ACTIVE. Nothing to hand over, nothing to
 * leak, nobody sharing a temporary password over chat.
 */
export const inviteSuperAdmin = asyncHandler(
  async (req: SuperAdminAuthRequest, res: Response) => {
    const firstName = normalizeText(req.body.firstName);
    const lastName = normalizeText(req.body.lastName);
    const email = normalizeText(req.body.email).toLowerCase();

    if (!firstName || !lastName || !email) {
      res.status(400).json({
        success: false,
        message: "First name, last name, and email are required.",
      });
      return;
    }
    if (!isValidEmail(email)) {
      res.status(400).json({
        success: false,
        message: "A valid email address is required.",
      });
      return;
    }
    // Checked before the account exists — creating one we cannot send a link for
    // would strand it in INVITED with no way in.
    if (!process.env.SUPER_ADMIN_PASSWORD_SETUP_URL) {
      res.status(500).json({
        success: false,
        message: "SUPER_ADMIN_PASSWORD_SETUP_URL is not configured.",
      });
      return;
    }
    const existingEmail = await prisma.superAdmin.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existingEmail) {
      res.status(409).json({
        success: false,
        message: "A super-admin account with this email already exists.",
      });
      return;
    }

    let superAdmin;
    try {
      superAdmin = await prisma.superAdmin.create({
        data: {
          firstName,
          lastName,
          email,
          status: SuperAdminStatus.INVITED,
        },
        select: SUPER_ADMIN_SELECT,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        res.status(409).json({
          success: false,
          message: "A super-admin account with this email already exists.",
        });
        return;
      }
      throw error;
    }

    const emailSent = await deliverSuperAdminInvite(superAdmin);

    res.status(201).json({
      success: true,
      message: emailSent
        ? "Invitation sent."
        : "Account created, but the invitation email could not be sent. Resend it.",
      data: { superAdmin: serializeSuperAdmin(superAdmin), emailSent },
    });
  },
);

/**
 * Re-issues the link for an account that never accepted. Issuing a new token
 * retires the previous one, so a forwarded invitation stops working.
 */
export const resendSuperAdminInvite = asyncHandler(
  async (req: SuperAdminAuthRequest, res: Response) => {
    const superAdminId = parseSuperAdminId(req.params.superAdminId);
    if (!superAdminId) {
      res.status(400).json({ success: false, message: "Invalid super-admin id." });
      return;
    }

    const superAdmin = await prisma.superAdmin.findUnique({
      where: { id: superAdminId },
      select: SUPER_ADMIN_SELECT,
    });
    if (!superAdmin) {
      res.status(404).json({ success: false, message: "Super-admin not found." });
      return;
    }
    if (superAdmin.status !== SuperAdminStatus.INVITED) {
      res.status(409).json({
        success: false,
        message: "This account has already been set up.",
      });
      return;
    }
    if (!process.env.SUPER_ADMIN_PASSWORD_SETUP_URL) {
      res.status(500).json({
        success: false,
        message: "SUPER_ADMIN_PASSWORD_SETUP_URL is not configured.",
      });
      return;
    }

    if (!(await deliverSuperAdminInvite(superAdmin))) {
      res.status(502).json({
        success: false,
        message: "The invitation email could not be sent. Try again shortly.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Invitation resent.",
      data: { superAdmin: serializeSuperAdmin(superAdmin) },
    });
  },
);

/**
 * Root-initiated password reset: mails the account a link to choose a new
 * password. It does not set one — root never learns or picks another admin's
 * password, it only hands them the means to set their own.
 *
 * The public `/auth/password/forgot` route stays available to admins who can
 * still read their own inbox; this exists for the case where root needs to push
 * one out, and it confirms the address rather than hiding behind the neutral
 * "if an account exists" wording, because root is entitled to know.
 */
export const sendSuperAdminPasswordReset = asyncHandler(
  async (req: SuperAdminAuthRequest, res: Response) => {
    const superAdminId = parseSuperAdminId(req.params.superAdminId);
    if (!superAdminId) {
      res.status(400).json({ success: false, message: "Invalid super-admin id." });
      return;
    }

    const superAdmin = await prisma.superAdmin.findUnique({
      where: { id: superAdminId },
      select: SUPER_ADMIN_SELECT,
    });
    if (!superAdmin) {
      res.status(404).json({ success: false, message: "Super-admin not found." });
      return;
    }
    // An invited account already has an outstanding invitation, and a disabled
    // one must not be handed a way back in.
    if (superAdmin.status !== SuperAdminStatus.ACTIVE) {
      res.status(409).json({
        success: false,
        message:
          superAdmin.status === SuperAdminStatus.INVITED
            ? "This account has not accepted its invitation yet. Resend the invitation instead."
            : "A disabled account cannot be sent a reset link.",
      });
      return;
    }
    if (!process.env.SUPER_ADMIN_PASSWORD_SETUP_URL) {
      res.status(500).json({
        success: false,
        message: "SUPER_ADMIN_PASSWORD_SETUP_URL is not configured.",
      });
      return;
    }

    if (!(await deliverSuperAdminPasswordReset(superAdmin))) {
      res.status(502).json({
        success: false,
        message: "The reset email could not be sent. Try again shortly.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: `Password reset link sent to ${superAdmin.email}.`,
      data: { superAdmin: serializeSuperAdmin(superAdmin) },
    });
  },
);

export const listSuperAdmins = asyncHandler(async (_req, res) => {
  const superAdmins = await prisma.superAdmin.findMany({
    orderBy: { createdAt: "desc" },
    select: SUPER_ADMIN_SELECT,
  });

  res.status(200).json({
    success: true,
    data: { superAdmins: superAdmins.map(serializeSuperAdmin) },
  });
});

export const updateSuperAdmin = asyncHandler(
  async (req: SuperAdminAuthRequest, res: Response) => {
    const superAdminId = parseSuperAdminId(req.params.superAdminId);
    if (!superAdminId) {
      res.status(400).json({
        success: false,
        message: "Invalid super-admin id.",
      });
      return;
    }

    const existing = await prisma.superAdmin.findUnique({
      where: { id: superAdminId },
      select: { id: true, email: true, password: true },
    });
    if (!existing) {
      res.status(404).json({
        success: false,
        message: "Super-admin not found.",
      });
      return;
    }

    // Anyone may edit their own profile; only root may edit someone else's.
    // Without the self exception a non-root admin could never change their own
    // name or password.
    const isSelf = superAdminId.toString() === req.superAdminId;
    if (!isSelf && !isRootSuperAdminEmail(req.superAdmin?.email)) {
      res.status(403).json({
        success: false,
        message: "Only the root super-admin can edit other accounts.",
      });
      return;
    }

    const data: {
      firstName?: string;
      lastName?: string;
      email?: string;
      password?: string;
    } = {};

    for (const field of ["firstName", "lastName"] as const) {
      if (field in req.body) {
        const value = normalizeText(req.body[field]);
        if (!value) {
          res.status(400).json({
            success: false,
            message: `${field} cannot be empty.`,
          });
          return;
        }
        data[field] = value;
      }
    }

    if ("email" in req.body) {
      const email = normalizeText(req.body.email).toLowerCase();
      if (!isValidEmail(email)) {
        res.status(400).json({
          success: false,
          message: "A valid email address is required.",
        });
        return;
      }
      data.email = email;
    }

    if ("password" in req.body) {
      if (superAdminId.toString() !== req.superAdminId) {
        res.status(403).json({
          success: false,
          message: "You can only change your own password.",
        });
        return;
      }

      const currentPassword =
        typeof req.body.currentPassword === "string"
          ? req.body.currentPassword
          : "";
      // `password` is null on an account that never accepted its invitation.
      // There is no current password to prove, so this route is not the way in —
      // the emailed link is.
      if (
        !existing.password ||
        !currentPassword ||
        !(await comparePassword(currentPassword, existing.password))
      ) {
        res.status(401).json({
          success: false,
          message: "Current password is incorrect.",
        });
        return;
      }

      const password =
        typeof req.body.password === "string" ? req.body.password : "";
      if (!isValidSuperAdminPassword(password)) {
        res.status(400).json({
          success: false,
          message: "Password must be at least 12 characters.",
        });
        return;
      }
      data.password = await hashPassword(password);
    }

    if (!Object.keys(data).length) {
      res.status(400).json({
        success: false,
        message: "Provide at least one super-admin field to update.",
      });
      return;
    }
    if (data.email) {
      const existingEmail = await prisma.superAdmin.findFirst({
        where: {
          email: data.email,
          id: { not: superAdminId },
        },
        select: { id: true },
      });
      if (existingEmail) {
        res.status(409).json({
          success: false,
          message: "A super-admin account with this email already exists.",
        });
        return;
      }
    }

    let superAdmin;
    try {
      superAdmin = await prisma.superAdmin.update({
        where: { id: superAdminId },
        data,
        select: SUPER_ADMIN_SELECT,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        res.status(409).json({
          success: false,
          message: "A super-admin account with this email already exists.",
        });
        return;
      }
      throw error;
    }

    res.status(200).json({
      success: true,
      message: "Super-admin account updated successfully.",
      data: { superAdmin: serializeSuperAdmin(superAdmin) },
    });
  },
);

export const changeSuperAdminStatus = asyncHandler(
  async (req: SuperAdminAuthRequest, res: Response) => {
    const superAdminId = parseSuperAdminId(req.params.superAdminId);
    if (!superAdminId) {
      res.status(400).json({
        success: false,
        message: "Invalid super-admin id.",
      });
      return;
    }
    if (!isSuperAdminStatus(req.body.status)) {
      res.status(400).json({
        success: false,
        message: "Status must be ACTIVE or DISABLED.",
      });
      return;
    }
    if (
      superAdminId.toString() === req.superAdminId &&
      req.body.status === SuperAdminStatus.DISABLED
    ) {
      res.status(409).json({
        success: false,
        message: "You cannot disable your own super-admin account.",
      });
      return;
    }
    const target = await prisma.superAdmin.findUnique({
      where: { id: superAdminId },
      select: { id: true, email: true, status: true },
    });
    if (!target) {
      res.status(404).json({
        success: false,
        message: "Super-admin not found.",
      });
      return;
    }
    // The root account is the deployment's way back in. Disabling it — by
    // anyone, including itself — would leave the console owned by whoever holds
    // the remaining accounts.
    if (
      req.body.status === SuperAdminStatus.DISABLED &&
      isRootSuperAdminEmail(target.email)
    ) {
      res.status(409).json({
        success: false,
        message: "The root super-admin account cannot be disabled.",
      });
      return;
    }
    // Flipping an invited account to ACTIVE would produce an account with no
    // password that nothing can sign into. It leaves INVITED by setting a
    // password, and only that way.
    if (target.status === SuperAdminStatus.INVITED) {
      res.status(409).json({
        success: false,
        message:
          "This account has not accepted its invitation yet. Resend the invitation instead.",
      });
      return;
    }
    const superAdmin = await updateStatusSafely(
      superAdminId,
      req.body.status,
    );
    if (!superAdmin) {
      res.status(409).json({
        success: false,
        message: "At least one active super-admin is required.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Super-admin account status updated successfully.",
      data: { superAdmin: serializeSuperAdmin(superAdmin) },
    });
  },
);
