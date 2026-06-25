import {
  AccountStatus,
  AppStatus,
  MemberAppRoleStatus,
  MemberStatus,
  OrganizationAppStatus,
  OrganizationRole,
  AppPermissionStatus,
  RoleStatus,
} from "../../../generated/prisma/enums.js";
import { prisma } from "../../../prisma.js";

export type AppAccessSource =
  | "ORGANIZATION_ROLE"
  | "EXPLICIT_ROLE"
  | "DEFAULT_ROLE"
  | "NONE";

export interface EffectiveAppAccess {
  organizationId: bigint;
  organizationMemberId: bigint | null;
  userId: bigint;
  organizationRole: OrganizationRole;
  appId: bigint;
  appKey: string;
  role: {
    id: bigint;
    key: string | null;
    name: string;
    isDefault: boolean;
  } | null;
  source: AppAccessSource;
  permissions: string[];
  hasAccess: boolean;
  bypass: boolean;
}

export interface AppAccessFailure {
  status: number;
  message: string;
}

type AppAccessResult =
  | { ok: true; access: EffectiveAppAccess }
  | { ok: false; error: AppAccessFailure };

const activePermissionKeys = (
  appId: bigint,
  links:
    | Array<{
        appPermission: {
          appId: bigint;
          key: string;
          status: AppPermissionStatus;
        };
      }>
    | undefined,
) =>
  (links ?? [])
    .filter(
      ({ appPermission }) =>
        appPermission.appId === appId &&
        appPermission.status === AppPermissionStatus.ACTIVE,
    )
    .map(({ appPermission }) => appPermission.key)
    .sort();

export const resolveEffectiveAppAccess = async ({
  organizationId,
  appKey,
  userId,
}: {
  organizationId: bigint;
  appKey: string;
  userId: bigint;
}): Promise<AppAccessResult> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isActive: true, status: true },
  });
  if (
    !user ||
    !user.isActive ||
    user.status !== AccountStatus.ACTIVE
  ) {
    return {
      ok: false,
      error: { status: 403, message: "Your account is not active." },
    };
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, ownerId: true, status: true },
  });
  if (!organization) {
    return {
      ok: false,
      error: { status: 404, message: "Organization not found" },
    };
  }
  if (organization.status !== AccountStatus.ACTIVE) {
    return {
      ok: false,
      error: { status: 403, message: "This organization is not active." },
    };
  }

  const app = await prisma.app.findUnique({
    where: { key: appKey },
    select: { id: true, key: true, status: true },
  });
  if (!app || app.status !== AppStatus.ACTIVE) {
    return {
      ok: false,
      error: { status: 404, message: "Active app not found" },
    };
  }

  const organizationApp = await prisma.organizationApp.findUnique({
    where: {
      organizationId_appId: {
        organizationId,
        appId: app.id,
      },
    },
    select: { status: true },
  });
  if (
    !organizationApp ||
    organizationApp.status !== OrganizationAppStatus.ACTIVE
  ) {
    return {
      ok: false,
      error: {
        status: 403,
        message: "This organization does not have active access to the app.",
      },
    };
  }

  let organizationRole: OrganizationRole = OrganizationRole.OWNER;
  let organizationMemberId: bigint | null = null;

  if (organization.ownerId !== userId) {
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId,
        },
      },
      select: { id: true, organizationRole: true, status: true },
    });
    if (!membership || membership.status !== MemberStatus.ACTIVE) {
      return {
        ok: false,
        error: {
          status: 403,
          message: "You do not have active access to this organization.",
        },
      };
    }
    organizationRole = membership.organizationRole;
    organizationMemberId = membership.id;
  } else {
    const ownerMembership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId,
        },
      },
      select: { id: true },
    });
    organizationMemberId = ownerMembership?.id ?? null;
  }

  if (
    organizationRole === OrganizationRole.OWNER ||
    organizationRole === OrganizationRole.ADMIN
  ) {
    const permissions = await prisma.appPermission.findMany({
      where: { appId: app.id, status: AppPermissionStatus.ACTIVE },
      orderBy: { key: "asc" },
      select: { key: true },
    });
    return {
      ok: true,
      access: {
        organizationId,
        organizationMemberId,
        userId,
        organizationRole,
        appId: app.id,
        appKey: app.key,
        role: null,
        source: "ORGANIZATION_ROLE",
        permissions: permissions.map(({ key }) => key),
        hasAccess: true,
        bypass: true,
      },
    };
  }

  const explicitAssignment = organizationMemberId
    ? await prisma.memberAppRole.findUnique({
        where: {
          organizationMemberId_appId: {
            organizationMemberId,
            appId: app.id,
          },
        },
        select: {
          status: true,
          appRole: {
            select: {
              id: true,
              appId: true,
              key: true,
              name: true,
              isDefault: true,
              status: true,
              appRolePermissions: {
                select: {
                  appPermission: {
                    select: { appId: true, key: true, status: true },
                  },
                },
              },
            },
          },
        },
      })
    : null;

  if (
    explicitAssignment?.status === MemberAppRoleStatus.ACTIVE &&
    explicitAssignment.appRole.status === RoleStatus.ACTIVE &&
    explicitAssignment.appRole.appId === app.id
  ) {
    const role = explicitAssignment.appRole;
    return {
      ok: true,
      access: {
        organizationId,
        organizationMemberId,
        userId,
        organizationRole,
        appId: app.id,
        appKey: app.key,
        role: {
          id: role.id,
          key: role.key,
          name: role.name,
          isDefault: role.isDefault,
        },
        source: "EXPLICIT_ROLE",
        permissions: activePermissionKeys(app.id, role.appRolePermissions),
        hasAccess: true,
        bypass: false,
      },
    };
  }

  const defaultRole = await prisma.appRole.findFirst({
    where: {
      appId: app.id,
      isDefault: true,
      status: RoleStatus.ACTIVE,
    },
    select: {
      id: true,
      key: true,
      name: true,
      isDefault: true,
      appRolePermissions: {
        select: {
          appPermission: {
            select: { appId: true, key: true, status: true },
          },
        },
      },
    },
  });
  if (defaultRole) {
    return {
      ok: true,
      access: {
        organizationId,
        organizationMemberId,
        userId,
        organizationRole,
        appId: app.id,
        appKey: app.key,
        role: {
          id: defaultRole.id,
          key: defaultRole.key,
          name: defaultRole.name,
          isDefault: true,
        },
        source: "DEFAULT_ROLE",
        permissions: activePermissionKeys(
          app.id,
          defaultRole.appRolePermissions,
        ),
        hasAccess: true,
        bypass: false,
      },
    };
  }

  return {
    ok: true,
    access: {
      organizationId,
      organizationMemberId,
      userId,
      organizationRole,
      appId: app.id,
      appKey: app.key,
      role: null,
      source: "NONE",
      permissions: [],
      hasAccess: false,
      bypass: false,
    },
  };
};

export const serializeEffectiveAppAccess = (access: EffectiveAppAccess) => ({
  organizationId: access.organizationId.toString(),
  organizationMemberId: access.organizationMemberId?.toString() ?? null,
  userId: access.userId.toString(),
  organizationRole: access.organizationRole,
  appId: access.appId.toString(),
  appKey: access.appKey,
  role: access.role
    ? { ...access.role, id: access.role.id.toString() }
    : null,
  source: access.source,
  permissions: access.permissions,
  hasAccess: access.hasAccess,
  bypass: access.bypass,
});
