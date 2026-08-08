import { Prisma } from "../../generated/prisma/client.js";
import {
  SuperAdminStatus,
  SuperAdminTokenType,
} from "../../generated/prisma/enums.js";
import { prisma } from "../../prisma.js";
import { parseId } from "../../../utils/parseId.js";
import { isWriteConflictError } from "../../utils/prisma.utils.js";
import { SUPER_ADMIN_SELECT } from "../authentication/super_admin_auth.helpers.js";
import {
  buildSuperAdminPasswordUrl,
  issueSuperAdminToken,
  sendSuperAdminInviteEmail,
  sendSuperAdminPasswordResetEmail,
} from "../authentication/super_admin_password.helpers.js";

export const parseSuperAdminId = (value: unknown) => {
  return typeof value === "string" ? parseId(value) : null;
};

export const normalizeText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

/**
 * Only ACTIVE and DISABLED are assignable over the API. INVITED is not a state
 * an admin may put an account into — it is where the invitation puts it, and
 * only setting a password leaves it.
 */
const ASSIGNABLE_STATUSES: SuperAdminStatus[] = [
  SuperAdminStatus.ACTIVE,
  SuperAdminStatus.DISABLED,
];

export const isSuperAdminStatus = (
  value: unknown,
): value is (typeof ASSIGNABLE_STATUSES)[number] =>
  typeof value === "string" &&
  ASSIGNABLE_STATUSES.includes(value as SuperAdminStatus);

export const isValidSuperAdminPassword = (password: string) =>
  password.length >= 12;

/**
 * Issues an invite link and mails it. Returns whether the mail went out rather
 * than throwing: the account already exists at this point, and a bounced SMTP
 * connection should leave the caller able to say "resend", not a 500 that hides
 * a created account.
 */
export const deliverSuperAdminInvite = async (superAdmin: {
  id: string;
  firstName: string;
  email: string;
}) => {
  const { token } = await issueSuperAdminToken(
    superAdmin.id,
    SuperAdminTokenType.INVITE,
  );

  const setupLink = buildSuperAdminPasswordUrl(token);
  if (!setupLink) return false;

  try {
    await sendSuperAdminInviteEmail(superAdmin, setupLink);
    return true;
  } catch (error) {
    console.error("[SuperAdminInvite] email delivery failed:", error);
    return false;
  }
};

/**
 * Same shape as the invite delivery, with a reset token and the reset template.
 * Issuing retires any outstanding reset link for the account, so only the newest
 * one works.
 */
export const deliverSuperAdminPasswordReset = async (superAdmin: {
  id: string;
  firstName: string;
  email: string;
}) => {
  const { token } = await issueSuperAdminToken(
    superAdmin.id,
    SuperAdminTokenType.PASSWORD_RESET,
  );

  const resetLink = buildSuperAdminPasswordUrl(token);
  if (!resetLink) return false;

  try {
    await sendSuperAdminPasswordResetEmail(superAdmin, resetLink);
    return true;
  } catch (error) {
    console.error("[SuperAdminPasswordReset] email delivery failed:", error);
    return false;
  }
};

export const updateStatusSafely = async (
  superAdminId: string,
  status: SuperAdminStatus,
) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          if (status === SuperAdminStatus.DISABLED) {
            const activeCount = await tx.superAdmin.count({
              where: {
                id: { not: superAdminId },
                status: SuperAdminStatus.ACTIVE,
              },
            });
            if (activeCount === 0) return null;
          }

          return tx.superAdmin.update({
            where: { id: superAdminId },
            data: { status },
            select: SUPER_ADMIN_SELECT,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isWriteConflictError(error) && attempt < 2) continue;
      throw error;
    }
  }

  throw new Error("Unable to update super-admin status.");
};
