import { Response } from "express";
import {
  AccountStatus,
  MemberStatus,
  OrganizationRole,
} from "../../../generated/prisma/enums.js";
import { prisma } from "../../../prisma.js";
import { isActiveAccount } from "../../../utils/account.utils.js";

export const MEMBER_SELECT = {
  id: true,
  organizationId: true,
  userId: true,
  organizationRole: true,
  jobTitle: true,
  status: true,
  invitedBy: true,
  joinedAt: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      avatarUrl: true,
      isActive: true,
    },
  },
} as const;

const MANAGEABLE_ROLES: OrganizationRole[] = [
  OrganizationRole.ADMIN,
  OrganizationRole.MEMBER,
];
const MANAGEABLE_STATUSES: MemberStatus[] = [
  MemberStatus.ACTIVE,
  MemberStatus.INACTIVE,
  MemberStatus.SUSPENDED,
];

export type MemberManager = {
  organizationId: bigint;
  ownerId: bigint;
  userId: bigint;
  organizationRole: OrganizationRole;
};

export const isManageableOrganizationRole = (
  role: unknown,
): role is OrganizationRole =>
  typeof role === "string" && MANAGEABLE_ROLES.includes(role as OrganizationRole);

export const manageableOrganizationRoles = () => MANAGEABLE_ROLES.join(", ");

export const isManageableMemberStatus = (
  status: unknown,
): status is MemberStatus =>
  typeof status === "string" && MANAGEABLE_STATUSES.includes(status as MemberStatus);

export const manageableMemberStatuses = () => MANAGEABLE_STATUSES.join(", ");

export const serializeMember = <
  T extends {
    id: bigint;
    organizationId: bigint;
    userId: bigint;
    invitedBy: bigint | null;
    user?: {
      id: bigint;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
      phone: string | null;
      avatarUrl?: string | null;
      isActive: boolean;
    };
  },
>(
  member: T,
) => ({
  ...member,
  id: member.id.toString(),
  organizationId: member.organizationId.toString(),
  userId: member.userId.toString(),
  invitedBy: member.invitedBy?.toString() ?? null,
  user: member.user
    ? {
        ...member.user,
        id: member.user.id.toString(),
      }
    : undefined,
});

export const requireMemberManager = async (
  organizationId: bigint,
  userId: bigint,
  res: Response,
): Promise<MemberManager | null> => {
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

  if (organization.status !== AccountStatus.ACTIVE) {
    res.status(403).json({
      success: false,
      message: "This organization is not active.",
    });
    return null;
  }

  if (organization.ownerId === userId) {
    return {
      organizationId,
      ownerId: organization.ownerId,
      userId,
      organizationRole: OrganizationRole.OWNER,
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

  if (membership.organizationRole !== OrganizationRole.ADMIN) {
    res.status(403).json({
      success: false,
      message: "Only organization owners and admins can manage members.",
    });
    return null;
  }

  return {
    organizationId,
    ownerId: organization.ownerId,
    userId,
    organizationRole: OrganizationRole.ADMIN,
  };
};

export const findTargetMember = async (
  organizationId: bigint,
  memberId: bigint,
  res: Response,
) => {
  const member = await prisma.organizationMember.findFirst({
    where: {
      id: memberId,
      organizationId,
    },
    select: MEMBER_SELECT,
  });

  if (!member) {
    res.status(404).json({
      success: false,
      message: "Organization member not found",
    });
    return null;
  }

  return member;
};

export const canManageTargetMember = (
  actor: MemberManager,
  target: {
    userId: bigint;
    organizationRole: OrganizationRole;
  },
  res: Response,
) => {
  if (
    target.userId === actor.ownerId ||
    target.organizationRole === OrganizationRole.OWNER
  ) {
    res.status(403).json({
      success: false,
      message: "The organization owner cannot be managed through this endpoint.",
    });
    return false;
  }

  if (
    actor.organizationRole === OrganizationRole.ADMIN &&
    target.organizationRole !== OrganizationRole.MEMBER
  ) {
    res.status(403).json({
      success: false,
      message: "Admins can only manage regular members.",
    });
    return false;
  }

  return true;
};
