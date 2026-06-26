import {
  AppStatus,
  MemberAppRoleStatus,
  OrganizationAppStatus,
  OrganizationRole,
  AppPermissionStatus,
  RoleStatus,
} from "../../../generated/prisma/enums.js";
import type { OrganizationAccessContext } from "../organization/org.middleware.js";
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
  organizationAccess,
  appKey,
}: {
  organizationAccess: OrganizationAccessContext;
  appKey: string;
}): Promise<AppAccessResult> => {
  const {
    organizationId,
    organizationMemberId,
    userId,
    organizationRole,
  } = organizationAccess;
  const lookupOrganizationMemberId = organizationMemberId ?? BigInt(0);

  const app = await prisma.app.findUnique({
    where: { key: appKey },
    select: {
      id: true,
      key: true,
      status: true,
      organizationApps: {
        where: { organizationId },
        take: 1,
        select: { status: true },
      },
      appPermissions: {
        where: { status: AppPermissionStatus.ACTIVE },
        orderBy: { key: "asc" },
        select: { key: true },
      },
      memberAppRoles: {
        where: {
          organizationMemberId: lookupOrganizationMemberId,
        },
        take: 1,
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
      },
      appRoles: {
        where: {
          isDefault: true,
          status: RoleStatus.ACTIVE,
        },
        take: 1,
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
      },
    },
  });
  if (!app || app.status !== AppStatus.ACTIVE) {
    return {
      ok: false,
      error: { status: 404, message: "Active app not found" },
    };
  }

  const organizationApp = app.organizationApps[0] ?? null;
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

  if (
    organizationRole === OrganizationRole.OWNER ||
    organizationRole === OrganizationRole.ADMIN
  ) {
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
        permissions: app.appPermissions.map(({ key }) => key),
        hasAccess: true,
        bypass: true,
      },
    };
  }

  const explicitAssignment = app.memberAppRoles[0] ?? null;

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

  const defaultRole = app.appRoles[0] ?? null;
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
