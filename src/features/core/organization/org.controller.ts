import { Response } from "express";
import asyncHandler from "express-async-handler";
import {
  MemberStatus,
  OrganizationRole,
} from "../../../generated/prisma/enums.js";
import { AuthRequest } from "../../../middleware/users/auth.middleware.js";
import { prisma } from "../../../prisma.js";
import {
  authenticatedUserId,
  ensureUniqueSlug,
  isValidOrganizationStatus,
  normalizeOptionalString,
  ORGANIZATION_PROFILE_FIELDS,
  organizationIdFromParams,
  ORGANIZATION_SELECT,
  requireMembership,
  requireOwner,
  requireOwnerOrAdmin,
  serializeOrganization,
  slugify,
  validateContactFields,
  validOrganizationStatuses,
} from "./org.helpers.js";
import {
  ChangeOrganizationStatusRequestBody,
  CreateOrganizationRequestBody,
  UpdateOrganizationProfileRequestBody,
} from "./org.types.js";

export const createOrganization = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const userId = authenticatedUserId(req, res);
    if (!userId) return;

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
    }: CreateOrganizationRequestBody = req.body;

    const normalizedName = normalizeOptionalString(name);
    if (!normalizedName || typeof normalizedName !== "string") {
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
      select: { id: true, isActive: true },
    });

    if (!user || !user.isActive) {
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

    const uniqueSlug = await ensureUniqueSlug(baseSlug);

    const organization = await prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          name: normalizedName,
          slug: uniqueSlug,
          ownerId: userId,
          businessType: normalizeOptionalString(businessType) as string | null,
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

    res.status(201).json({
      success: true,
      message: "Organization created successfully",
      data: { organization: serializeOrganization(organization) },
    });
  },
);

export const updateOrganizationProfile = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const userId = authenticatedUserId(req, res);
    if (!userId) return;

    const organizationId = organizationIdFromParams(req.params.id);
    if (!organizationId) {
      res
        .status(400)
        .json({ success: false, message: "Invalid organization id" });
      return;
    }

    if (!(await requireOwnerOrAdmin(organizationId, userId, res))) return;

    const body: UpdateOrganizationProfileRequestBody = req.body;
    const data: Record<string, string | null | undefined> = {};

    if ("name" in body) {
      const name = normalizeOptionalString(body.name);
      if (!name || typeof name !== "string") {
        res.status(400).json({
          success: false,
          message: "Organization name cannot be empty",
        });
        return;
      }
      data.name = name;
    }

    if ("slug" in body) {
      const slug = normalizeOptionalString(body.slug);
      if (!slug || typeof slug !== "string") {
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

    const organization = await prisma.organization.update({
      where: { id: organizationId },
      data,
      select: ORGANIZATION_SELECT,
    });

    res.status(200).json({
      success: true,
      message: "Organization profile updated successfully",
      data: { organization: serializeOrganization(organization) },
    });
  },
);

export const changeOrganizationStatus = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const userId = authenticatedUserId(req, res);
    if (!userId) return;

    const organizationId = organizationIdFromParams(req.params.id);
    if (!organizationId) {
      res
        .status(400)
        .json({ success: false, message: "Invalid organization id" });
      return;
    }

    if (!(await requireOwner(organizationId, userId, res))) return;

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
  async (req: AuthRequest, res: Response) => {
    const userId = authenticatedUserId(req, res);
    if (!userId) return;

    const organizationId = organizationIdFromParams(req.params.id);
    if (!organizationId) {
      res
        .status(400)
        .json({ success: false, message: "Invalid organization id" });
      return;
    }

    if (!(await requireMembership(organizationId, userId, res))) return;

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
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
            roles: true,
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
    const userId = authenticatedUserId(req, res);
    if (!userId) return;

    const organizations = await prisma.organization.findMany({
      where: {
        OR: [
          { ownerId: userId },
          {
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
            roles: true,
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
