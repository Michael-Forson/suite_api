import { Response } from "express";
import asyncHandler from "express-async-handler";
import {
  AccountStatus,
  MemberStatus,
  OrganizationRole,
} from "../../../generated/prisma/enums.js";
import { AuthRequest } from "../../../middleware/users/auth.middleware.js";
import { prisma } from "../../../prisma.js";
import {
  CREATE_OPTIONAL_STRING_FIELDS,
  ensureUniqueSlug,
  isValidOrganizationStatus,
  MAX_CREATE_SLUG_ATTEMPTS,
  ORGANIZATION_PROFILE_FIELDS,
  ORGANIZATION_SELECT,
  serializeOrganization,
  slugify,
  validateContactFields,
  validateOptionalStringFields,
  validOrganizationStatuses,
} from "./org.helpers.js";
import { isActiveAccount } from "../../../utils/account.utils.js";
import { isUniqueConstraintError } from "../../../utils/prisma.utils.js";
import {
  normalizeOptionalString,
} from "../../../utils/validation.utils.js";
import { OrganizationAccessRequest } from "./org.middleware.js";
import {
  ChangeOrganizationStatusRequestBody,
  CreateOrganizationRequestBody,
  UpdateOrganizationProfileRequestBody,
} from "./org.types.js";

export const createOrganization = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
      return;
    }
    const userId = BigInt(req.userId);

    const body = req.body as CreateOrganizationRequestBody &
      Record<string, unknown>;
    if (!("name" in body) || body.name === undefined || body.name === null) {
      res.status(400).json({
        success: false,
        message: "Organization name is required",
      });
      return;
    }

    if (typeof body.name !== "string") {
      res.status(400).json({
        success: false,
        message: "Organization name must be a string",
      });
      return;
    }

    if (!validateOptionalStringFields(body, CREATE_OPTIONAL_STRING_FIELDS, res)) {
      return;
    }

    const {
      name,
      slug,
      businessType,
      industry,
      email,
      phone,
      logoUrl,
      country,
      city,
      address,
    } = body;

    const normalizedName = normalizeOptionalString(name);
    if (!normalizedName) {
      res.status(400).json({
        success: false,
        message: "Organization name is required",
      });
      return;
    }

    const normalizedEmail = normalizeOptionalString(email) as string | null;
    const normalizedPhone = normalizeOptionalString(phone) as string | null;
    const contactError = validateContactFields(normalizedEmail, normalizedPhone);
    if (contactError) {
      res.status(400).json({ success: false, message: contactError });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true, status: true },
    });

    if (!isActiveAccount(user)) {
      res.status(403).json({
        success: false,
        message: "Your account is not active.",
      });
      return;
    }

    const baseSlug = slugify(slug || normalizedName);
    if (!baseSlug) {
      res.status(400).json({
        success: false,
        message: "Organization name must contain letters or numbers",
      });
      return;
    }

    let organization: Awaited<ReturnType<typeof prisma.organization.create>> | null =
      null;

    for (let attempt = 0; attempt < MAX_CREATE_SLUG_ATTEMPTS; attempt += 1) {
      const uniqueSlug = await ensureUniqueSlug(baseSlug);

      try {
        organization = await prisma.$transaction(async (tx) => {
          const created = await tx.organization.create({
            data: {
              name: normalizedName,
              slug: uniqueSlug,
              ownerId: userId,
              businessType: normalizeOptionalString(
                businessType,
              ) as string | null,
              industry: normalizeOptionalString(industry) as string | null,
              email: normalizedEmail,
              phone: normalizedPhone,
              logoUrl: normalizeOptionalString(logoUrl) as string | null,
              country: normalizeOptionalString(country) as string | null,
              city: normalizeOptionalString(city) as string | null,
              address: normalizeOptionalString(address) as string | null,
            },
            select: ORGANIZATION_SELECT,
          });

          await tx.organizationMember.create({
            data: {
              organizationId: created.id,
              userId,
              organizationRole: OrganizationRole.OWNER,
              status: MemberStatus.ACTIVE,
              joinedAt: new Date(),
            },
          });

          return created;
        });
        break;
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
      }
    }

    if (!organization) {
      res.status(409).json({
        success: false,
        message: "Organization slug is already in use",
      });
      return;
    }

    res.status(201).json({
      success: true,
      message: "Organization created successfully",
      data: { organization: serializeOrganization(organization) },
    });
  },
);

export const updateOrganizationProfile = asyncHandler(
  async (req: OrganizationAccessRequest, res: Response) => {
    const organizationId = req.organizationAccess?.organizationId;
    if (!organizationId) {
      res.status(500).json({
        success: false,
        message: "Organization access middleware is required.",
      });
      return;
    }

    const body = req.body as UpdateOrganizationProfileRequestBody &
      Record<string, unknown>;
    const data: Record<string, string | null | undefined> = {};

    if ("name" in body) {
      if (typeof body.name !== "string") {
        res.status(400).json({
          success: false,
          message: "Organization name must be a string",
        });
        return;
      }

      const name = normalizeOptionalString(body.name);
      if (!name) {
        res.status(400).json({
          success: false,
          message: "Organization name cannot be empty",
        });
        return;
      }
      data.name = name;
    }

    if ("slug" in body) {
      if (typeof body.slug !== "string") {
        res.status(400).json({
          success: false,
          message: "Organization slug must be a string",
        });
        return;
      }

      const slug = normalizeOptionalString(body.slug);
      if (!slug) {
        res.status(400).json({
          success: false,
          message: "Organization slug cannot be empty",
        });
        return;
      }

      const normalizedSlug = slugify(slug);
      if (!normalizedSlug) {
        res.status(400).json({
          success: false,
          message: "Organization slug must contain letters or numbers",
        });
        return;
      }

      const existing = await prisma.organization.findUnique({
        where: { slug: normalizedSlug },
        select: { id: true },
      });

      if (existing && existing.id !== organizationId) {
        res.status(409).json({
          success: false,
          message: "Organization slug is already in use",
        });
        return;
      }

      data.slug = normalizedSlug;
    }

    if (!validateOptionalStringFields(body, ORGANIZATION_PROFILE_FIELDS, res)) {
      return;
    }

    for (const field of ORGANIZATION_PROFILE_FIELDS) {
      if (field in body) {
        data[field] = normalizeOptionalString(body[field]) as string | null;
      }
    }

    const contactError = validateContactFields(
      data.email as string | null | undefined,
      data.phone as string | null | undefined,
    );
    if (contactError) {
      res.status(400).json({ success: false, message: contactError });
      return;
    }

    if (!Object.keys(data).length) {
      res.status(400).json({
        success: false,
        message: "Provide at least one profile field to update",
      });
      return;
    }

    let organization;
    try {
      organization = await prisma.organization.update({
        where: { id: organizationId },
        data,
        select: ORGANIZATION_SELECT,
      });
    } catch (error) {
      if (isUniqueConstraintError(error) && data.slug) {
        res.status(409).json({
          success: false,
          message: "Organization slug is already in use",
        });
        return;
      }

      throw error;
    }

    res.status(200).json({
      success: true,
      message: "Organization profile updated successfully",
      data: { organization: serializeOrganization(organization) },
    });
  },
);

export const changeOrganizationStatus = asyncHandler(
  async (req: OrganizationAccessRequest, res: Response) => {
    const organizationId = req.organizationAccess?.organizationId;
    if (!organizationId) {
      res.status(500).json({
        success: false,
        message: "Organization access middleware is required.",
      });
      return;
    }

    const { status }: ChangeOrganizationStatusRequestBody = req.body;
    if (!isValidOrganizationStatus(status)) {
      res.status(400).json({
        success: false,
        message: `Status must be one of: ${validOrganizationStatuses()}`,
      });
      return;
    }

    const organization = await prisma.organization.update({
      where: { id: organizationId },
      data: { status },
      select: ORGANIZATION_SELECT,
    });

    res.status(200).json({
      success: true,
      message: "Organization status updated successfully",
      data: { organization: serializeOrganization(organization) },
    });
  },
);

export const getOrganizationDetails = asyncHandler(
  async (req: OrganizationAccessRequest, res: Response) => {
    const access = req.organizationAccess;
    if (!access) {
      res.status(500).json({
        success: false,
        message: "Organization access middleware is required.",
      });
      return;
    }

    const organization = await prisma.organization.findUnique({
      where: { id: access.organizationId },
      select: {
        ...ORGANIZATION_SELECT,
        members: {
          where: { userId: access.userId },
          take: 1,
          orderBy: { createdAt: "asc" },
        },
        _count: {
          select: {
            members: true,
            apps: true,
          },
        },
      },
    });

    if (!organization) {
      res.status(404).json({
        success: false,
        message: "Organization not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: { organization: serializeOrganization(organization) },
    });
  },
);

export const listUserOrganizations = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
      return;
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
      return;
    }

    const organizations = await prisma.organization.findMany({
      where: {
        OR: [
          { ownerId: userId },
          {
            status: AccountStatus.ACTIVE,
            members: {
              some: {
                userId,
                status: MemberStatus.ACTIVE,
              },
            },
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: {
        ...ORGANIZATION_SELECT,
        members: {
          where: { userId },
          take: 1,
          orderBy: { createdAt: "asc" },
        },
        _count: {
          select: {
            members: true,
            apps: true,
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      data: {
        organizations: organizations.map(serializeOrganization),
      },
    });
  },
);
