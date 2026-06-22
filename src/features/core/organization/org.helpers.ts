import { Response } from "express";
import {
  AccountStatus,
  MemberStatus,
  OrganizationRole,
} from "../../../generated/prisma/enums.js";
import { AuthRequest } from "../../../middleware/users/auth.middleware.js";
import { prisma } from "../../../prisma.js";
import { parseId } from "../../../utils/parseId.js";
import { isValidEmail, isValidPhone } from "../../../utils/validators.js";

export const ORGANIZATION_SELECT = {
  id: true,
  name: true,
  slug: true,
  ownerId: true,
  businessType: true,
  industry: true,
  email: true,
  phone: true,
  logoUrl: true,
  country: true,
  city: true,
  address: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const ORGANIZATION_PROFILE_FIELDS = [
  "businessType",
  "industry",
  "email",
  "phone",
  "logoUrl",
  "country",
  "city",
  "address",
] as const;

const VALID_STATUSES = Object.values(AccountStatus);

export const validOrganizationStatuses = () => VALID_STATUSES.join(", ");

export const isValidOrganizationStatus = (
  status: unknown,
): status is AccountStatus =>
  typeof status === "string" && VALID_STATUSES.includes(status as AccountStatus);

export const serializeOrganization = <
  T extends {
    id: bigint;
    ownerId: bigint;
    members?: Array<{
      id: bigint;
      organizationId: bigint;
      userId: bigint;
      invitedBy: bigint | null;
      organizationRole: string;
      jobTitle: string | null;
      status: string;
      joinedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    }>;
    _count?: { members?: number; apps?: number; roles?: number };
  },
>(
  organization: T,
) => ({
  ...organization,
  id: organization.id.toString(),
  ownerId: organization.ownerId.toString(),
  members: organization.members?.map((member) => ({
    ...member,
    id: member.id.toString(),
    organizationId: member.organizationId.toString(),
    userId: member.userId.toString(),
    invitedBy: member.invitedBy?.toString() ?? null,
  })),
});

export const normalizeOptionalString = (value: unknown) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

export const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 150);

export const ensureUniqueSlug = async (baseSlug: string) => {
  const normalizedBase = slugify(baseSlug);
  let candidate = normalizedBase;
  let suffix = 1;

  while (await prisma.organization.findUnique({ where: { slug: candidate } })) {
    const nextSuffix = `-${suffix}`;
    candidate = `${normalizedBase.slice(0, 150 - nextSuffix.length)}${nextSuffix}`;
    suffix += 1;
  }

  return candidate;
};

export const validateContactFields = (
  email?: string | null,
  phone?: string | null,
) => {
  if (email && !isValidEmail(email)) {
    return "Invalid email format";
  }

  if (phone && !isValidPhone(phone)) {
    return "Invalid phone format";
  }

  return null;
};

const findMembership = async (organizationId: bigint, userId: bigint) =>
  prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId,
      },
    },
    select: {
      id: true,
      organizationRole: true,
      status: true,
    },
  });

export const requireMembership = async (
  organizationId: bigint,
  userId: bigint,
  res: Response,
) => {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { ownerId: true },
  });

  if (!organization) {
    res.status(404).json({
      success: false,
      message: "Organization not found",
    });
    return null;
  }

  if (organization.ownerId === userId) {
    return {
      organizationRole: OrganizationRole.OWNER,
      status: MemberStatus.ACTIVE,
    };
  }

  const membership = await findMembership(organizationId, userId);
  if (!membership || membership.status !== MemberStatus.ACTIVE) {
    res.status(403).json({
      success: false,
      message: "You do not have access to this organization.",
    });
    return null;
  }

  return membership;
};

export const requireOwnerOrAdmin = async (
  organizationId: bigint,
  userId: bigint,
  res: Response,
) => {
  const membership = await requireMembership(organizationId, userId, res);
  if (!membership) return null;

  if (
    membership.organizationRole !== OrganizationRole.OWNER &&
    membership.organizationRole !== OrganizationRole.ADMIN
  ) {
    res.status(403).json({
      success: false,
      message: "Only organization owners and admins can perform this action.",
    });
    return null;
  }

  return membership;
};

export const requireOwner = async (
  organizationId: bigint,
  userId: bigint,
  res: Response,
) => {
  const membership = await requireMembership(organizationId, userId, res);
  if (!membership) return null;

  if (membership.organizationRole !== OrganizationRole.OWNER) {
    res.status(403).json({
      success: false,
      message: "Only the organization owner can perform this action.",
    });
    return null;
  }

  return membership;
};

export const authenticatedUserId = (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
    return null;
  }

  return BigInt(req.userId);
};

export const organizationIdFromParams = (id: string | string[] | undefined) =>
  typeof id === "string" ? parseId(id) : null;
