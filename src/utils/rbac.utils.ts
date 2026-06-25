import {
  AppPermissionStatus,
  RoleStatus,
} from "../generated/prisma/enums.js";

export const normalizeRbacKey = (value: unknown, maxLength = 150) => {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (
    !key ||
    key.length > maxLength ||
    !/^[a-z0-9][a-z0-9._:-]*$/.test(key)
  ) {
    return null;
  }
  return key;
};

export const APP_PERMISSION_SELECT = {
  id: true,
  appId: true,
  key: true,
  label: true,
  description: true,
  category: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const APP_ROLE_SELECT = {
  id: true,
  appId: true,
  key: true,
  name: true,
  description: true,
  isDefault: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  appRolePermissions: {
    orderBy: { appPermission: { key: "asc" as const } },
    select: {
      appPermission: {
        select: APP_PERMISSION_SELECT,
      },
    },
  },
} as const;

export const serializeAppPermission = <
  T extends { id: bigint; appId: bigint },
>(
  permission: T,
) => ({
  ...permission,
  id: permission.id.toString(),
  appId: permission.appId.toString(),
});

export const serializeAppRole = <
  T extends {
    id: bigint;
    appId: bigint;
    appRolePermissions?: Array<{
      appPermission: Parameters<typeof serializeAppPermission>[0];
    }>;
  },
>(
  role: T,
) => {
  const { appRolePermissions, ...rest } = role;
  return {
    ...rest,
    id: role.id.toString(),
    appId: role.appId.toString(),
    permissions: appRolePermissions?.map(({ appPermission }) =>
      serializeAppPermission(appPermission),
    ),
  };
};

export const isAppPermissionActive = (status: AppPermissionStatus) =>
  status === AppPermissionStatus.ACTIVE;

export const isRoleActive = (status: RoleStatus) =>
  status === RoleStatus.ACTIVE;
