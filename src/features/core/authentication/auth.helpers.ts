import {
  MemberStatus,
  OrganizationRole,
} from "../../../generated/prisma/enums.js";
import { prisma } from "../../../prisma.js";
import {
  generateAccessToken,
  generateRefreshToken,
  UserOrgAccessClaim,
} from "../../../utils/tokens.js";

export const buildUserOrgAccessClaims = async (
  userId: bigint,
): Promise<UserOrgAccessClaim[]> => {
  const [memberships, ownedOrganizations] = await prisma.$transaction([
    prisma.organizationMember.findMany({
      where: {
        userId,
        status: MemberStatus.ACTIVE,
      },
      select: {
        id: true,
        organizationId: true,
        organizationRole: true,
        status: true,
        organization: {
          select: {
            ownerId: true,
            status: true,
          },
        },
      },
    }),
    prisma.organization.findMany({
      where: { ownerId: userId },
      select: {
        id: true,
        status: true,
        members: {
          where: { userId },
          take: 1,
          select: {
            id: true,
            status: true,
          },
        },
      },
    }),
  ]);

  const claimsByOrganization = new Map<string, UserOrgAccessClaim>();

  for (const membership of memberships) {
    claimsByOrganization.set(membership.organizationId.toString(), {
      organizationId: membership.organizationId.toString(),
      organizationMemberId: membership.id.toString(),
      ownerId: membership.organization.ownerId.toString(),
      organizationRole:
        membership.organization.ownerId === userId
          ? OrganizationRole.OWNER
          : membership.organizationRole,
      memberStatus: membership.status,
      organizationStatus: membership.organization.status,
    });
  }

  for (const organization of ownedOrganizations) {
    const organizationId = organization.id.toString();
    if (claimsByOrganization.has(organizationId)) continue;

    const ownerMembership = organization.members[0] ?? null;
    claimsByOrganization.set(organizationId, {
      organizationId,
      organizationMemberId: ownerMembership?.id.toString() ?? null,
      ownerId: userId.toString(),
      organizationRole: OrganizationRole.OWNER,
      memberStatus: ownerMembership?.status ?? MemberStatus.ACTIVE,
      organizationStatus: organization.status,
    });
  }

  return Array.from(claimsByOrganization.values());
};

export const issueUserTokens = async (userId: bigint) => {
  const orgs = await buildUserOrgAccessClaims(userId);

  return {
    accessToken: generateAccessToken(userId, "user", { orgs }),
    refreshToken: generateRefreshToken(userId, "user"),
  };
};
