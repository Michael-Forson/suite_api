import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import {
  SuperAdminStatus,
  SuperAdminTokenType,
} from "../../../generated/prisma/enums.js";
import { prisma } from "../../../prisma.js";
import { sendTemplateEmail } from "../../../utils/emails/email.service.js";
import { hashPassword } from "../../../utils/password.js";
import { isValidEmail } from "../../../utils/validators.js";
import { isValidSuperAdminPassword } from "../account/account.helpers.js";
import {
  buildSuperAdminPasswordUrl,
  findUsableSuperAdminToken,
  issueSuperAdminToken,
  sendSuperAdminPasswordResetEmail,
  superAdminTokenExpiryHours,
} from "./super_admin_password.helpers.js";

/**
 * The same answer whether or not the address exists. Anything else turns this
 * endpoint into a way to enumerate super-admin emails.
 */
const RESET_REQUESTED_MESSAGE =
  "If an account exists for this address, a password reset link has been sent.";

/** Deliberately identical for missing, spent, expired and malformed tokens. */
const INVALID_TOKEN_MESSAGE = "This link is invalid or has expired.";

export const requestSuperAdminPasswordReset = asyncHandler(
  async (req: Request, res: Response) => {
    const email =
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";

    if (!email || !isValidEmail(email)) {
      res.status(400).json({
        success: false,
        message: "A valid email address is required.",
      });
      return;
    }

    const superAdmin = await prisma.superAdmin.findUnique({
      where: { email },
      select: { id: true, firstName: true, email: true, status: true },
    });

    // Disabled accounts get nothing; an invited one that never accepted gets a
    // fresh link so a lost invitation is self-service.
    if (
      superAdmin &&
      superAdmin.status !== SuperAdminStatus.DISABLED
    ) {
      const type =
        superAdmin.status === SuperAdminStatus.INVITED
          ? SuperAdminTokenType.INVITE
          : SuperAdminTokenType.PASSWORD_RESET;

      const { token } = await issueSuperAdminToken(superAdmin.id, type);
      const link = buildSuperAdminPasswordUrl(token);

      if (!link) {
        res.status(500).json({
          success: false,
          message: "SUPER_ADMIN_PASSWORD_SETUP_URL is not configured.",
        });
        return;
      }

      if (type === SuperAdminTokenType.INVITE) {
        await sendTemplateEmail(superAdmin.email, "Admin_Invite", {
          name: superAdmin.firstName,
          setupLink: link,
          expiresInHours: superAdminTokenExpiryHours(type),
        });
      } else {
        await sendSuperAdminPasswordResetEmail(superAdmin, link);
      }
    }

    res.status(200).json({ success: true, message: RESET_REQUESTED_MESSAGE });
  },
);

/**
 * Checks a link before the form renders, so an expired one says so instead of
 * failing after the user has typed a password twice. Returns only what the page
 * needs to greet them and pick its wording.
 */
export const getSuperAdminPasswordToken = asyncHandler(
  async (req: Request, res: Response) => {
    const token = typeof req.params.token === "string" ? req.params.token : "";
    const record = await findUsableSuperAdminToken(token);

    if (!record) {
      res.status(404).json({ success: false, message: INVALID_TOKEN_MESSAGE });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        type: record.type,
        email: record.superAdmin.email,
        firstName: record.superAdmin.firstName,
      },
    });
  },
);

/**
 * Spends the token and sets the password. This is the only path by which an
 * invited account becomes ACTIVE — nobody is issued a password they did not
 * choose, so there is no first-login handover to leak.
 */
export const setSuperAdminPassword = asyncHandler(
  async (req: Request, res: Response) => {
    const token = typeof req.body.token === "string" ? req.body.token : "";
    const password =
      typeof req.body.password === "string" ? req.body.password : "";

    const record = await findUsableSuperAdminToken(token);
    if (!record) {
      res.status(400).json({ success: false, message: INVALID_TOKEN_MESSAGE });
      return;
    }

    if (!isValidSuperAdminPassword(password)) {
      res.status(400).json({
        success: false,
        message: "Password must be at least 12 characters.",
      });
      return;
    }

    const hashed = await hashPassword(password);

    await prisma.$transaction(async (tx) => {
      // Re-check inside the transaction: two submissions of the same link must
      // not both succeed.
      const spent = await tx.superAdminToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (spent.count === 0) return;

      await tx.superAdmin.update({
        where: { id: record.superAdminId },
        data: { password: hashed, status: SuperAdminStatus.ACTIVE },
      });

      // Setting a password invalidates every other outstanding link for this
      // account — an old invite must not survive a reset.
      await tx.superAdminToken.updateMany({
        where: { superAdminId: record.superAdminId, usedAt: null },
        data: { usedAt: new Date() },
      });
    });

    res.status(200).json({
      success: true,
      message: "Password set successfully. You can now sign in.",
    });
  },
);
