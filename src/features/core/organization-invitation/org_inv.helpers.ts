import crypto from "crypto";
import { Response } from "express";
import {
  AccountStatus,
  InvitationStatus,
  OrganizationRole,
} from "../../../generated/prisma/enums.js";
import { AuthRequest } from "../../../middleware/users/auth.middleware.js";
import { prisma } from "../../../prisma.js";
import { sendTemplateEmail } from "../../../utils/emails/email.service.js";
import { parseId } from "../../../utils/parseId.js";
import {
  authenticatedUserId,
  idFromParams,
} from "../../../utils/request.utils.js";
import { requireMemberManager } from "../organization-member/org_mem.helpers.js";

export const INVITATION_SELECT = {
  id: true,
  organizationId: true,
  email: true,
  invitedBy: true,
  organizationRole: true,
  status: true,
  token: true,
  expiresAt: true,
  acceptedAt: true,
  createdAt: true,
  updatedAt: true,
  organization: {
    select: {
      id: true,
      name: true,
      slug: true,
      ownerId: true,
      status: true,
    },
  },
  inviter: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  },
} as const;

const INVITABLE_ROLES: OrganizationRole[] = [
  OrganizationRole.ADMIN,
  OrganizationRole.MEMBER,
];

export const invitationIdFromParams = (
  id: string | string[] | undefined,
) => (typeof id === "string" ? parseId(id) : null);

export const tokenFromParams = (
  token: string | string[] | undefined,
) => (typeof token === "string" && token.trim() ? token.trim() : null);

export const normalizeEmail = (email: unknown) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

export const createUniqueInvitationToken = async () => {
  let token = generateInvitationToken();

  while (await prisma.organizationInvitation.findUnique({ where: { token } })) {
    token = generateInvitationToken();
  }

  return token;
};

export const ensureInvitationCanBeManaged = async (
  req: AuthRequest,
  res: Response,
) => {
  const userId = authenticatedUserId(req, res);
  if (!userId) return null;

  const organizationId = idFromParams(req.params.organizationId);
  if (!organizationId) {
    res
      .status(400)
      .json({ success: false, message: "Invalid organization id" });
    return null;
  }

  const actor = await requireMemberManager(organizationId, userId, res);
  if (!actor) return null;

  return { userId, organizationId, actor };
};
const INVITATION_EXPIRY_DAYS = 7;

export const isInvitableOrganizationRole = (
  role: unknown,
): role is OrganizationRole =>
  typeof role === "string" && INVITABLE_ROLES.includes(role as OrganizationRole);

export const invitableOrganizationRoles = () => INVITABLE_ROLES.join(", ");

export const generateInvitationToken = () =>
  crypto.randomBytes(32).toString("hex");

export const invitationExpiresAt = () => {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRY_DAYS);
  return expiresAt;
};

export const serializeInvitation = <
  T extends {
    id: bigint;
    organizationId: bigint;
    invitedBy: bigint;
    organization?: {
      id: bigint;
      name: string;
      slug: string;
      ownerId: bigint;
      status: AccountStatus;
    };
    inviter?: {
      id: bigint;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
    };
  },
>(
  invitation: T,
) => ({
  ...invitation,
  id: invitation.id.toString(),
  organizationId: invitation.organizationId.toString(),
  invitedBy: invitation.invitedBy.toString(),
  organization: invitation.organization
    ? {
        ...invitation.organization,
        id: invitation.organization.id.toString(),
        ownerId: invitation.organization.ownerId.toString(),
      }
    : undefined,
  inviter: invitation.inviter
    ? {
        ...invitation.inviter,
        id: invitation.inviter.id.toString(),
      }
    : undefined,
});

export const buildInvitationAcceptUrl = (token: string) => {
  const baseUrl = process.env.INVITATION_ACCEPT_URL;
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

export const requireInvitationLink = (token: string, res: Response) => {
  const invitationLink = buildInvitationAcceptUrl(token);
  if (!invitationLink) {
    res.status(500).json({
      success: false,
      message: "INVITATION_ACCEPT_URL is not configured.",
    });
    return null;
  }

  return invitationLink;
};

export const sendOrganizationInvitationEmail = async (
  invitation: {
    email: string;
    token: string;
    organizationRole: OrganizationRole;
    expiresAt: Date;
    organization: { name: string };
    inviter?: {
      firstName: string | null;
      lastName: string | null;
      email: string | null;
    };
  },
  invitationLink: string,
) => {
  const inviterName = [
    invitation.inviter?.firstName,
    invitation.inviter?.lastName,
  ]
    .filter(Boolean)
    .join(" ");

  await sendTemplateEmail(invitation.email, "App_Organization_Invitation", {
    organizationName: invitation.organization.name,
    invitationLink,
    organizationRole: invitation.organizationRole,
    inviterName: inviterName || invitation.inviter?.email || "A team admin",
    expiresInDays: INVITATION_EXPIRY_DAYS,
    expiresAt: invitation.expiresAt.toISOString(),
  });
};

export const findInvitationForOrganization = async (
  organizationId: bigint,
  invitationId: bigint,
  res: Response,
) => {
  const invitation = await prisma.organizationInvitation.findFirst({
    where: {
      id: invitationId,
      organizationId,
    },
    select: INVITATION_SELECT,
  });

  if (!invitation) {
    res.status(404).json({
      success: false,
      message: "Organization invitation not found",
    });
    return null;
  }

  return invitation;
};

export const expireInvitationIfNeeded = async (
  invitation: {
    id: bigint;
    status: InvitationStatus;
    expiresAt: Date;
  },
) => {
  if (
    invitation.status === InvitationStatus.PENDING &&
    invitation.expiresAt <= new Date()
  ) {
    await prisma.organizationInvitation.update({
      where: { id: invitation.id },
      data: { status: InvitationStatus.EXPIRED },
    });
    return true;
  }

  return false;
};
