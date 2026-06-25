import { NextFunction, Response } from "express";
import asyncHandler from "express-async-handler";
import {
  AccountStatus,
  MemberStatus,
  OrganizationRole,
} from "../../../generated/prisma/enums.js";
import { AuthRequest } from "../../../middleware/users/auth.middleware.js";
import { prisma } from "../../../prisma.js";
import { isActiveAccount } from "../../../utils/account.utils.js";
import { idFromParams } from "../../../utils/request.utils.js";

export interface OrganizationAccessContext {
  organizationId: bigint;
  ownerId: bigint;
  userId: bigint;
  organizationRole: OrganizationRole;
  status: MemberStatus;
  organizationStatus: AccountStatus;
}

export interface OrganizationAccessRequest extends AuthRequest {
  organizationAccess?: OrganizationAccessContext;
}

const organizationIdFromRequest = (req: AuthRequest) =>
  idFromParams(req.params.organizationId);

const resolveOrganizationAccess = async (
  req: AuthRequest,
  res: Response,
  options: { allowInactiveOrganization?: boolean } = {},
): Promise<OrganizationAccessContext | null> => {
  if (!req.userId) {
    res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
    return null;
  }

  const userId = BigInt(req.userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isActive: true, status: true },
  });

  if (!isActiveAccount(user)) {
    res.status(403).json({
      success: false,
      message: "Your account is not active.",
    });
    return null;
  }

  const organizationId = organizationIdFromRequest(req);
  if (!organizationId) {
    res.status(400).json({
      success: false,
      message: "Invalid organization id",
    });
    return null;
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, ownerId: true, status: true },
  });

  if (!organization) {
    res.status(404).json({
      success: false,
      message: "Organization not found",
    });
    return null;
  }

  const forbidInactiveOrganization = () => {
    if (
      !options.allowInactiveOrganization &&
      organization.status !== AccountStatus.ACTIVE
    ) {
      res.status(403).json({
        success: false,
        message: "This organization is not active.",
      });
      return true;
    }

    return false;
  };

  if (organization.ownerId === userId) {
    if (forbidInactiveOrganization()) return null;

    return {
      organizationId,
      ownerId: organization.ownerId,
      userId,
      organizationRole: OrganizationRole.OWNER,
      status: MemberStatus.ACTIVE,
      organizationStatus: organization.status,
    };
  }

  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId,
      },
    },
    select: {
      organizationRole: true,
      status: true,
    },
  });

  if (!membership || membership.status !== MemberStatus.ACTIVE) {
    res.status(403).json({
      success: false,
      message: "You do not have access to this organization.",
    });
    return null;
  }

  if (forbidInactiveOrganization()) return null;

  return {
    organizationId,
    ownerId: organization.ownerId,
    userId,
    organizationRole: membership.organizationRole,
    status: membership.status,
    organizationStatus: organization.status,
  };
};

const attachOrganizationAccess = async (
  req: OrganizationAccessRequest,
  res: Response,
  next: NextFunction,
) => {
  const access = await resolveOrganizationAccess(req, res);
  if (!access) return;

  req.organizationAccess = access;
  next();
};

export const requireOrganizationMembership = asyncHandler(
  attachOrganizationAccess,
);

export const requireOrganizationOwnerOrAdmin = asyncHandler(
  async (req: OrganizationAccessRequest, res: Response, next: NextFunction) => {
    const access = await resolveOrganizationAccess(req, res);
    if (!access) return;

    if (
      access.organizationRole !== OrganizationRole.OWNER &&
      access.organizationRole !== OrganizationRole.ADMIN
    ) {
      res.status(403).json({
        success: false,
        message: "Only organization owners and admins can perform this action.",
      });
      return;
    }

    req.organizationAccess = access;
    next();
  },
);

export const requireOrganizationOwner = asyncHandler(
  async (req: OrganizationAccessRequest, res: Response, next: NextFunction) => {
    const access = await resolveOrganizationAccess(req, res, {
      allowInactiveOrganization: true,
    });
    if (!access) return;

    if (access.organizationRole !== OrganizationRole.OWNER) {
      res.status(403).json({
        success: false,
        message: "Only the organization owner can perform this action.",
      });
      return;
    }

    req.organizationAccess = access;
    next();
  },
);
