import { Response } from "express";
import { AccountStatus } from "../../../generated/prisma/enums.js";
import { Prisma } from "../../../generated/prisma/client.js";
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

export const isActiveAccount = (
  account: { isActive: boolean; status: AccountStatus } | null,
) => !!account && account.isActive && account.status === AccountStatus.ACTIVE;

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

export const isOptionalStringValue = (value: unknown) =>
  value === undefined || value === null || typeof value === "string";

export const isUniqueConstraintError = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002";

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
