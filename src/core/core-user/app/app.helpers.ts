import { Response } from "express";
import { AuthRequest } from "../../../middleware/users/auth.middleware.js";
import { publicUrl } from "../../../utils/s3.js";

/** The key is an internal detail; callers get the resolved `iconUrl` instead. */
const omitIconKey = <T extends { iconKey?: string | null }>({
  iconKey: _iconKey,
  ...rest
}: T) => rest;

export const ORGANIZATION_APP_SELECT = {
  id: true,
  organizationId: true,
  appId: true,
  status: true,
  accessType: true,
  enabledBy: true,
  enabledAt: true,
  disabledBy: true,
  disabledAt: true,
  createdAt: true,
  updatedAt: true,
  app: {
    select: {
      id: true,
      name: true,
      key: true,
      description: true,
      iconKey: true,
      status: true,
    },
  },
  enabler: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
    },
  },
  disabler: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
    },
  },
} as const;

const serializeUserSummary = <
  T extends {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
  },
>(
  user: T | null,
) =>
  user
    ? {
        ...user,
        id: user.id.toString(),
      }
    : null;

export const serializeOrganizationApp = <
  T extends {
    id: string;
    organizationId: string;
    appId: string;
    enabledBy: string | null;
    disabledBy: string | null;
    app?: {
      id: string;
      iconKey?: string | null;
    };
    enabler?: Parameters<typeof serializeUserSummary>[0];
    disabler?: Parameters<typeof serializeUserSummary>[0];
  },
>(
  organizationApp: T,
) => ({
  ...organizationApp,
  id: organizationApp.id.toString(),
  organizationId: organizationApp.organizationId.toString(),
  appId: organizationApp.appId.toString(),
  enabledBy: organizationApp.enabledBy?.toString() ?? null,
  disabledBy: organizationApp.disabledBy?.toString() ?? null,
  app: organizationApp.app
    ? {
        ...omitIconKey(organizationApp.app),
        id: organizationApp.app.id.toString(),
        iconUrl: publicUrl(organizationApp.app.iconKey),
      }
    : undefined,
  enabler: serializeUserSummary(organizationApp.enabler ?? null),
  disabler: serializeUserSummary(organizationApp.disabler ?? null),
});

export const ensureAuthenticated = (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
    return false;
  }

  return true;
};
