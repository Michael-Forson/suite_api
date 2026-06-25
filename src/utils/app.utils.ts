import { AppStatus } from "../generated/prisma/enums.js";

export const APP_SELECT = {
  id: true,
  name: true,
  key: true,
  description: true,
  iconUrl: true,
  appUrl: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

const VALID_APP_STATUSES = Object.values(AppStatus);

export const validAppStatuses = () => VALID_APP_STATUSES.join(", ");

export const isValidAppStatus = (status: unknown): status is AppStatus =>
  typeof status === "string" &&
  VALID_APP_STATUSES.includes(status as AppStatus);

export const appKeyFromValue = (value: unknown) => {
  if (typeof value !== "string") return null;
  if (!value.trim() || value.length > 100) return null;
  return value;
};

export const serializeApp = <
  T extends {
    id: bigint;
    _count?: {
      organizationApps?: number;
      appPermissions?: number;
      appRoles?: number;
    };
  },
>(
  app: T,
) => {
  const { _count, ...rest } = app;
  return {
    ...rest,
    id: app.id.toString(),
    _count: _count
      ? {
          organizationApps: _count.organizationApps,
          permissions: _count.appPermissions,
          roles: _count.appRoles,
          appRoles: _count.appRoles,
        }
      : undefined,
  };
};
