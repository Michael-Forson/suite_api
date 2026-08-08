import crypto from "crypto";
import { SuperAdminTokenType } from "../../generated/prisma/enums.js";
import { prisma } from "../../prisma.js";
import { sendTemplateEmail } from "../../../utils/emails/email.service.js";

/**
 * Invites and password resets are the same capability — a single-use, expiring
 * right to set a password — so they share this module and differ only by type.
 *
 * An invite lives long enough to survive a weekend; a reset does not, because it
 * is triggered by anyone who knows an email address.
 */
const EXPIRY_HOURS: Record<SuperAdminTokenType, number> = {
  INVITE: 72,
  PASSWORD_RESET: 1,
};

export const superAdminTokenExpiryHours = (type: SuperAdminTokenType) =>
  EXPIRY_HOURS[type];

const generateToken = () => crypto.randomBytes(32).toString("hex");

const expiresAt = (type: SuperAdminTokenType) => {
  const date = new Date();
  date.setHours(date.getHours() + EXPIRY_HOURS[type]);
  return date;
};

/**
 * Issues a link token, retiring any outstanding one of the same type first.
 *
 * Retiring matters: without it, a resent invitation leaves the previous link
 * live, and revoking access would mean hunting down every mail ever sent.
 */
export const issueSuperAdminToken = async (
  superAdminId: string,
  type: SuperAdminTokenType,
) => {
  let token = generateToken();
  while (await prisma.superAdminToken.findUnique({ where: { token } })) {
    token = generateToken();
  }

  return prisma.$transaction(async (tx) => {
    await tx.superAdminToken.updateMany({
      where: { superAdminId, type, usedAt: null },
      data: { usedAt: new Date() },
    });

    return tx.superAdminToken.create({
      data: { superAdminId, type, token, expiresAt: expiresAt(type) },
    });
  });
};

/**
 * Looks a token up without spending it. Used by the page that renders the
 * set-password form, so an expired link says so before the user types anything.
 */
export const findUsableSuperAdminToken = async (token: string) => {
  if (!token) return null;

  const record = await prisma.superAdminToken.findUnique({
    where: { token },
    include: {
      superAdmin: {
        select: { id: true, firstName: true, email: true, status: true },
      },
    },
  });

  if (!record || record.usedAt || record.expiresAt <= new Date()) return null;
  // A disabled account's outstanding link must not become a way back in.
  if (record.superAdmin.status === "DISABLED") return null;

  return record;
};

export const buildSuperAdminPasswordUrl = (token: string) => {
  const baseUrl = process.env.SUPER_ADMIN_PASSWORD_SETUP_URL;
  if (!baseUrl) return null;

  if (baseUrl.includes("{{token}}")) {
    return baseUrl.replace(/{{token}}/g, encodeURIComponent(token));
  }

  try {
    const url = new URL(baseUrl);
    url.searchParams.set("token", token);
    return url.toString();
  } catch {
    const separator = baseUrl.includes("?") ? "&" : "?";
    return `${baseUrl}${separator}token=${encodeURIComponent(token)}`;
  }
};

export const sendSuperAdminInviteEmail = async (
  superAdmin: { firstName: string; email: string },
  setupLink: string,
) =>
  sendTemplateEmail(superAdmin.email, "Admin_Invite", {
    name: superAdmin.firstName,
    setupLink,
    expiresInHours: EXPIRY_HOURS.INVITE,
  });

export const sendSuperAdminPasswordResetEmail = async (
  superAdmin: { firstName: string; email: string },
  resetLink: string,
) =>
  sendTemplateEmail(superAdmin.email, "Admin_Password_Reset", {
    name: superAdmin.firstName,
    resetLink,
    expiresInHours: EXPIRY_HOURS.PASSWORD_RESET,
  });
