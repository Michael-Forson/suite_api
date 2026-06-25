import { Response } from "express";
import { AuthRequest } from "../../../middleware/users/auth.middleware.js";

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
      iconUrl: true,
      appUrl: true,
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
    id: bigint;
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
    id: bigint;
    organizationId: bigint;
    appId: bigint;
    enabledBy: bigint | null;
    disabledBy: bigint | null;
    app?: {
      id: bigint;
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
        ...organizationApp.app,
        id: organizationApp.app.id.toString(),
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
