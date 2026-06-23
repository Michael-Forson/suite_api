import { Response } from "express";
import asyncHandler from "express-async-handler";
import {
  AccountStatus,
  InvitationStatus,
  MemberStatus,
  OrganizationRole,
} from "../../../generated/prisma/enums.js";
import { AuthRequest } from "../../../middleware/users/auth.middleware.js";
import { prisma } from "../../../prisma.js";
import { parseId } from "../../../utils/parseId.js";
import { isValidEmail } from "../../../utils/validators.js";
import {
  authenticatedUserId,
  isActiveAccount,
  normalizeOptionalString,
  organizationIdFromParams,
} from "../organization/org.helpers.js";
import { requireMemberManager } from "../organization-member/org_mem.helpers.js";
import {
  buildInvitationAcceptUrl,
  expireInvitationIfNeeded,
  findInvitationForOrganization,
  generateInvitationToken,
  invitationExpiresAt,
  INVITATION_SELECT,
  invitableOrganizationRoles,
  isInvitableOrganizationRole,
  requireInvitationLink,
  sendOrganizationInvitationEmail,
  serializeInvitation,
} from "./org_inv.helpers.js";
import {
  AcceptInvitationRequestBody,
  CreateStaffInvitationRequestBody,
} from "./org_inv.types.js";

const invitationIdFromParams = (id: string | string[] | undefined) =>
  typeof id === "string" ? parseId(id) : null;

const tokenFromParams = (token: string | string[] | undefined) =>
  typeof token === "string" && token.trim() ? token.trim() : null;

const normalizeEmail = (email: unknown) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

const createUniqueInvitationToken = async () => {
  let token = generateInvitationToken();

  while (await prisma.organizationInvitation.findUnique({ where: { token } })) {
    token = generateInvitationToken();
  }

  return token;
};

const ensureInvitationCanBeManaged = async (
  req: AuthRequest,
  res: Response,
) => {
  const userId = authenticatedUserId(req, res);
  if (!userId) return null;

  const organizationId = organizationIdFromParams(req.params.organizationId);
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

export const createStaffInvitation = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const context = await ensureInvitationCanBeManaged(req, res);
    if (!context) return;

    const {
      email,
      organizationRole = OrganizationRole.MEMBER,
      jobTitle,
    }: CreateStaffInvitationRequestBody = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      res.status(400).json({
        success: false,
        message: "A valid email is required",
      });
      return;
    }

    if (!isInvitableOrganizationRole(organizationRole)) {
      res.status(400).json({
        success: false,
        message: `Organization role must be one of: ${invitableOrganizationRoles()}`,
      });
      return;
    }

    if (
      context.actor.organizationRole === OrganizationRole.ADMIN &&
      organizationRole !== OrganizationRole.MEMBER
    ) {
      res.status(403).json({
        success: false,
        message: "Admins can only invite regular members.",
      });
      return;
    }

    const invitedUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    let invitedUserHasPendingMembership = false;

    if (invitedUser) {
      const existingMember = await prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: context.organizationId,
            userId: invitedUser.id,
          },
        },
        select: { id: true, status: true },
      });

      if (existingMember && existingMember.status !== MemberStatus.PENDING) {
        res.status(409).json({
          success: false,
          message: "This user already belongs to the organization.",
        });
        return;
      }

      invitedUserHasPendingMembership = !!existingMember;
    }

    await prisma.organizationInvitation.updateMany({
      where: {
        organizationId: context.organizationId,
        email: normalizedEmail,
        status: InvitationStatus.PENDING,
        expiresAt: { lte: new Date() },
      },
      data: { status: InvitationStatus.EXPIRED },
    });

    const existingPendingInvitation =
      await prisma.organizationInvitation.findFirst({
        where: {
          organizationId: context.organizationId,
          email: normalizedEmail,
          status: InvitationStatus.PENDING,
        },
        select: { id: true },
      });

    if (existingPendingInvitation) {
      res.status(409).json({
        success: false,
        message: "A pending invitation already exists for this email.",
      });
      return;
    }

    const token = await createUniqueInvitationToken();
    const invitation = await prisma.$transaction(async (tx) => {
      const createdInvitation = await tx.organizationInvitation.create({
        data: {
          organizationId: context.organizationId,
          email: normalizedEmail,
          invitedBy: context.userId,
          organizationRole,
          token,
          expiresAt: invitationExpiresAt(),
        },
        select: INVITATION_SELECT,
      });

      if (invitedUser) {
        const normalizedJobTitle = normalizeOptionalString(jobTitle) as
          | string
          | null
          | undefined;

        await tx.organizationMember.upsert({
          where: {
            organizationId_userId: {
              organizationId: context.organizationId,
              userId: invitedUser.id,
            },
          },
          create: {
            organizationId: context.organizationId,
            userId: invitedUser.id,
            organizationRole,
            jobTitle: normalizedJobTitle ?? null,
            status: MemberStatus.PENDING,
            invitedBy: context.userId,
          },
          update: invitedUserHasPendingMembership
            ? {
                organizationRole,
                jobTitle: normalizedJobTitle ?? null,
                status: MemberStatus.PENDING,
                invitedBy: context.userId,
              }
            : {},
        });
      }

      return createdInvitation;
    });

    res.status(201).json({
      success: true,
      message: "Organization invitation created successfully",
      data: {
        invitation: serializeInvitation(invitation),
        invitationLink: buildInvitationAcceptUrl(invitation.token),
      },
    });
  },
);

export const sendInvitationEmail = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const context = await ensureInvitationCanBeManaged(req, res);
    if (!context) return;

    const invitationId = invitationIdFromParams(req.params.invitationId);
    if (!invitationId) {
      res
        .status(400)
        .json({ success: false, message: "Invalid invitation id" });
      return;
    }

    const invitation = await findInvitationForOrganization(
      context.organizationId,
      invitationId,
      res,
    );
    if (!invitation) return;

    if (await expireInvitationIfNeeded(invitation)) {
      res.status(400).json({
        success: false,
        message: "Invitation has expired.",
      });
      return;
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      res.status(400).json({
        success: false,
        message: "Only pending invitations can be emailed.",
      });
      return;
    }

    const invitationLink = requireInvitationLink(invitation.token, res);
    if (!invitationLink) return;

    await sendOrganizationInvitationEmail(invitation, invitationLink);

    res.status(200).json({
      success: true,
      message: "Invitation email sent successfully",
    });
  },
);

export const validateInvitationToken = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const organizationId = organizationIdFromParams(req.params.organizationId);
    const token = tokenFromParams(req.params.token);
    if (!organizationId || !token) {
      res
        .status(400)
        .json({ success: false, message: "Invalid organization id or token" });
      return;
    }

    const invitation = await prisma.organizationInvitation.findFirst({
      where: {
        organizationId,
        token,
      },
      select: INVITATION_SELECT,
    });

    if (!invitation) {
      res.status(404).json({
        success: false,
        message: "Invitation not found",
      });
      return;
    }

    if (invitation.organization.status !== AccountStatus.ACTIVE) {
      res.status(403).json({
        success: false,
        message: "This organization is not active.",
      });
      return;
    }

    if (await expireInvitationIfNeeded(invitation)) {
      res.status(400).json({
        success: false,
        message: "Invitation has expired.",
      });
      return;
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      res.status(400).json({
        success: false,
        message: `Invitation is ${invitation.status.toLowerCase()}.`,
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: { invitation: serializeInvitation(invitation) },
    });
  },
);

export const acceptInvitation = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const userId = authenticatedUserId(req, res);
    if (!userId) return;

    const organizationId = organizationIdFromParams(req.params.organizationId);
    if (!organizationId) {
      res
        .status(400)
        .json({ success: false, message: "Invalid organization id" });
      return;
    }

    const { token }: AcceptInvitationRequestBody = req.body;
    const normalizedToken = typeof token === "string" ? token.trim() : "";
    if (!normalizedToken) {
      res.status(400).json({
        success: false,
        message: "Invitation token is required",
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, isActive: true, status: true },
    });

    if (!user || !isActiveAccount(user)) {
      res.status(403).json({
        success: false,
        message: "Your account is not active.",
      });
      return;
    }

    if (!user.email) {
      res.status(400).json({
        success: false,
        message: "Your account needs an email address to accept invitations.",
      });
      return;
    }

    const invitation = await prisma.organizationInvitation.findFirst({
      where: {
        organizationId,
        token: normalizedToken,
      },
      select: INVITATION_SELECT,
    });

    if (!invitation) {
      res.status(404).json({
        success: false,
        message: "Invitation not found",
      });
      return;
    }

    if (invitation.organization.status !== AccountStatus.ACTIVE) {
      res.status(403).json({
        success: false,
        message: "This organization is not active.",
      });
      return;
    }

    if (await expireInvitationIfNeeded(invitation)) {
      res.status(400).json({
        success: false,
        message: "Invitation has expired.",
      });
      return;
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      res.status(400).json({
        success: false,
        message: `Invitation is ${invitation.status.toLowerCase()}.`,
      });
      return;
    }

    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      res.status(403).json({
        success: false,
        message: "This invitation is assigned to a different email address.",
      });
      return;
    }

    if (invitation.organization.ownerId === userId) {
      res.status(400).json({
        success: false,
        message: "The organization owner cannot accept a staff invitation.",
      });
      return;
    }

    const existingMember = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId,
        },
      },
      select: { organizationRole: true, jobTitle: true },
    });

    if (existingMember?.organizationRole === OrganizationRole.OWNER) {
      res.status(400).json({
        success: false,
        message: "The organization owner cannot accept a staff invitation.",
      });
      return;
    }

    const member = await prisma.$transaction(async (tx) => {
      const savedMember = await tx.organizationMember.upsert({
        where: {
          organizationId_userId: {
            organizationId: invitation.organizationId,
            userId,
          },
        },
        create: {
          organizationId: invitation.organizationId,
          userId,
          organizationRole: invitation.organizationRole,
          jobTitle: existingMember?.jobTitle ?? null,
          status: MemberStatus.ACTIVE,
          invitedBy: invitation.invitedBy,
          joinedAt: new Date(),
        },
        update: {
          organizationRole: invitation.organizationRole,
          jobTitle: existingMember?.jobTitle ?? null,
          status: MemberStatus.ACTIVE,
          invitedBy: invitation.invitedBy,
          joinedAt: new Date(),
        },
      });

      await tx.organizationInvitation.update({
        where: { id: invitation.id },
        data: {
          status: InvitationStatus.ACCEPTED,
          acceptedAt: new Date(),
        },
      });

      return savedMember;
    });

    res.status(200).json({
      success: true,
      message: "Invitation accepted successfully",
      data: {
        member: {
          ...member,
          id: member.id.toString(),
          organizationId: member.organizationId.toString(),
          userId: member.userId.toString(),
          invitedBy: member.invitedBy?.toString() ?? null,
        },
      },
    });
  },
);

export const expireOldInvitations = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const context = await ensureInvitationCanBeManaged(req, res);
    if (!context) return;

    const result = await prisma.organizationInvitation.updateMany({
      where: {
        organizationId: context.organizationId,
        status: InvitationStatus.PENDING,
        expiresAt: { lte: new Date() },
      },
      data: { status: InvitationStatus.EXPIRED },
    });

    res.status(200).json({
      success: true,
      message: "Expired invitations updated successfully",
      data: { count: result.count },
    });
  },
);

export const revokeInvitation = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const context = await ensureInvitationCanBeManaged(req, res);
    if (!context) return;

    const invitationId = invitationIdFromParams(req.params.invitationId);
    if (!invitationId) {
      res
        .status(400)
        .json({ success: false, message: "Invalid invitation id" });
      return;
    }

    const invitation = await findInvitationForOrganization(
      context.organizationId,
      invitationId,
      res,
    );
    if (!invitation) return;

    if (invitation.status !== InvitationStatus.PENDING) {
      res.status(400).json({
        success: false,
        message: "Only pending invitations can be revoked.",
      });
      return;
    }

    const updatedInvitation = await prisma.organizationInvitation.update({
      where: { id: invitation.id },
      data: { status: InvitationStatus.REVOKED },
      select: INVITATION_SELECT,
    });

    res.status(200).json({
      success: true,
      message: "Invitation revoked successfully",
      data: { invitation: serializeInvitation(updatedInvitation) },
    });
  },
);

export const resendInvitation = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const context = await ensureInvitationCanBeManaged(req, res);
    if (!context) return;

    const invitationId = invitationIdFromParams(req.params.invitationId);
    if (!invitationId) {
      res
        .status(400)
        .json({ success: false, message: "Invalid invitation id" });
      return;
    }

    const invitation = await findInvitationForOrganization(
      context.organizationId,
      invitationId,
      res,
    );
    if (!invitation) return;

    if (
      invitation.status === InvitationStatus.ACCEPTED ||
      invitation.status === InvitationStatus.REVOKED
    ) {
      res.status(400).json({
        success: false,
        message: "Accepted or revoked invitations cannot be resent.",
      });
      return;
    }

    const token = await createUniqueInvitationToken();
    const updatedInvitation = await prisma.organizationInvitation.update({
      where: { id: invitation.id },
      data: {
        token,
        status: InvitationStatus.PENDING,
        expiresAt: invitationExpiresAt(),
        acceptedAt: null,
      },
      select: INVITATION_SELECT,
    });

    const invitationLink = requireInvitationLink(updatedInvitation.token, res);
    if (!invitationLink) return;

    await sendOrganizationInvitationEmail(updatedInvitation, invitationLink);

    res.status(200).json({
      success: true,
      message: "Invitation resent successfully",
      data: {
        invitation: serializeInvitation(updatedInvitation),
        invitationLink,
      },
    });
  },
);
