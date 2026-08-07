import { Response } from "express";
import { AccountStatus } from "../../../generated/prisma/enums.js";
import { prisma } from "../../../prisma.js";
import { isOptionalStringValue } from "../../../utils/validation.utils.js";
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
  locationLabelSingular: true,
  locationLabelPlural: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const BRANCH_SELECT = {
  id: true,
  organizationId: true,
  name: true,
  code: true,
  location: true,
  isDefault: true,
  status: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
} as const;

/// Code given to the branch every organization is created with. Orgs that never
/// open a second location keep this one forever and never see the concept.
export const DEFAULT_BRANCH_CODE = "MAIN";

export const serializeBranch = <
  T extends { id: string; organizationId: string; createdBy?: string | null },
>(
  branch: T,
) => ({
  ...branch,
  id: branch.id.toString(),
  organizationId: branch.organizationId.toString(),
  createdBy: branch.createdBy?.toString() ?? null,
});

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

export const CREATE_OPTIONAL_STRING_FIELDS = [
  "slug",
  ...ORGANIZATION_PROFILE_FIELDS,
] as const;

export const MAX_CREATE_SLUG_ATTEMPTS = 3;

export const validateOptionalStringFields = (
  body: Record<string, unknown>,
  fields: readonly string[],
  res: Response,
) => {
  for (const field of fields) {
    if (field in body && !isOptionalStringValue(body[field])) {
      res.status(400).json({
        success: false,
        message: `${field} must be a string or null`,
      });
      return false;
    }
  }

  return true;
};

const VALID_STATUSES = Object.values(AccountStatus);

export const validOrganizationStatuses = () => VALID_STATUSES.join(", ");

export const isValidOrganizationStatus = (
  status: unknown,
): status is AccountStatus =>
  typeof status === "string" && VALID_STATUSES.includes(status as AccountStatus);

export const serializeOrganization = <
  T extends {
    id: string;
    ownerId: string;
    members?: Array<{
      id: string;
      organizationId: string;
      userId: string;
      invitedBy: string | null;
      organizationRole: string;
      jobTitle: string | null;
      status: string;
      joinedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    }>;
    _count?: { members?: number; apps?: number };
  },
>(
  organization: T,
) => {
  const { _count, ...rest } = organization;
  return {
    ...rest,
    id: organization.id.toString(),
    ownerId: organization.ownerId.toString(),
    members: organization.members?.map((member) => ({
      ...member,
      id: member.id.toString(),
      organizationId: member.organizationId.toString(),
      userId: member.userId.toString(),
      invitedBy: member.invitedBy?.toString() ?? null,
    })),
    _count: _count
      ? {
          members: _count.members,
          apps: _count.apps,
        }
      : undefined,
  };
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
