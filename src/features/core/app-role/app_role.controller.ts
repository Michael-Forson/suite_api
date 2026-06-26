import { Response } from "express";
import asyncHandler from "express-async-handler";
import {
  MemberAppRoleStatus,
  MemberStatus,
  OrganizationRole,
  AppPermissionStatus,
  RoleStatus,
} from "../../../generated/prisma/enums.js";
import { prisma } from "../../../prisma.js";
import { idFromParams } from "../../../utils/request.utils.js";
import {
  APP_ROLE_SELECT,
  normalizeRbacKey,
  serializeAppRole,
} from "../../../utils/rbac.utils.js";
import {
  serializeEffectiveAppAccess,
} from "./app_access.service.js";
import {
  AppAccessRequest,
  requireRoleManager,
  resolveRequestAccess,
} from "./app_role.helpers.js";

export const listOrganizationAppRoles = asyncHandler(async (req, res) => {
  const access = await requireRoleManager(req, res);
  if (!access) return;

  const roles = await prisma.appRole.findMany({
    where: {
      appId: access.appId,
      status: RoleStatus.ACTIVE,
    },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: {
      ...APP_ROLE_SELECT,
      appRolePermissions: {
        where: { appPermission: { status: AppPermissionStatus.ACTIVE } },
        orderBy: { appPermission: { key: "asc" } },
        select: {
          appPermission: {
            select: {
              id: true,
              appId: true,
              key: true,
              label: true,
              description: true,
              category: true,
              status: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      },
    },
  });
  res.status(200).json({
    success: true,
    data: { roles: roles.map(serializeAppRole) },
  });
});

export const assignMemberAppRole = asyncHandler(async (req, res) => {
  const access = await requireRoleManager(req, res);
  if (!access) return;
  const memberId = idFromParams(req.params.memberId);
  const roleKey = normalizeRbacKey(req.body.roleKey, 100);
  if (!memberId || !roleKey) {
    res.status(400).json({
      success: false,
      message: "A valid member id and roleKey are required",
    });
    return;
  }

  const member = await prisma.organizationMember.findFirst({
    where: {
      id: memberId,
      organizationId: access.organizationId,
    },
    select: { id: true, organizationRole: true, status: true },
  });
  if (!member) {
    res.status(404).json({
      success: false,
      message: "Organization member not found",
    });
    return;
  }
  if (
    member.organizationRole !== OrganizationRole.MEMBER ||
    member.status !== MemberStatus.ACTIVE
  ) {
    res.status(409).json({
      success: false,
      message: "Only active regular members can receive an app role",
    });
    return;
  }

  const role = await prisma.appRole.findUnique({
    where: {
      appId_key: {
        appId: access.appId,
        key: roleKey,
      },
    },
    select: { id: true, key: true, name: true, status: true },
  });
  if (!role || role.status !== RoleStatus.ACTIVE) {
    res.status(404).json({
      success: false,
      message: "Active app role not found",
    });
    return;
  }

  const assignment = await prisma.memberAppRole.upsert({
    where: {
      organizationMemberId_appId: {
        organizationMemberId: member.id,
        appId: access.appId,
      },
    },
    create: {
      organizationMemberId: member.id,
      appId: access.appId,
      appRoleId: role.id,
      assignedBy: access.userId,
      status: MemberAppRoleStatus.ACTIVE,
    },
    update: {
      appRoleId: role.id,
      assignedBy: access.userId,
      assignedAt: new Date(),
      status: MemberAppRoleStatus.ACTIVE,
    },
    select: {
      id: true,
      organizationMemberId: true,
      appId: true,
      appRoleId: true,
      status: true,
      assignedBy: true,
      assignedAt: true,
      appRole: {
        select: { key: true, name: true },
      },
    },
  });

  res.status(200).json({
    success: true,
    message: "Member app role assigned successfully",
    data: {
      assignment: {
        ...assignment,
        id: assignment.id.toString(),
        organizationMemberId: assignment.organizationMemberId.toString(),
        appId: assignment.appId.toString(),
        appRoleId: assignment.appRoleId.toString(),
        assignedBy: assignment.assignedBy?.toString() ?? null,
      },
    },
  });
});

export const removeMemberAppRole = asyncHandler(async (req, res) => {
  const access = await requireRoleManager(req, res);
  if (!access) return;
  const memberId = idFromParams(req.params.memberId);
  if (!memberId) {
    res.status(400).json({ success: false, message: "Invalid member id" });
    return;
  }
  const member = await prisma.organizationMember.findFirst({
    where: { id: memberId, organizationId: access.organizationId },
    select: { id: true, organizationRole: true },
  });
  if (!member) {
    res.status(404).json({
      success: false,
      message: "Organization member not found",
    });
    return;
  }
  if (member.organizationRole !== OrganizationRole.MEMBER) {
    res.status(409).json({
      success: false,
      message: "Owners and admins use organization-role access",
    });
    return;
  }

  await prisma.memberAppRole.deleteMany({
    where: {
      organizationMemberId: member.id,
      appId: access.appId,
    },
  });
  res.status(200).json({
    success: true,
    message: "Member app role removed successfully",
  });
});

export const getMyAppAccess = asyncHandler(
  async (req: AppAccessRequest, res) => {
    const access = req.appAccess ?? (await resolveRequestAccess(req, res));
    if (!access) return;
    res.status(200).json({
      success: true,
      data: { access: serializeEffectiveAppAccess(access) },
    });
  },
);
