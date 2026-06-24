import { Response } from "express";
import asyncHandler from "express-async-handler";
import {
  AppStatus,
  OrganizationAppStatus,
} from "../../../generated/prisma/enums.js";
import { AuthRequest } from "../../../middleware/users/auth.middleware.js";
import { prisma } from "../../../prisma.js";
import { OrganizationAccessRequest } from "../organization/org.middleware.js";
import {
  APP_SELECT,
  appKeyFromValue,
  serializeApp,
} from "./app.helpers.js";

const ORGANIZATION_APP_SELECT = {
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

const serializeOrganizationApp = <
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

const ensureAuthenticated = (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
    return false;
  }

  return true;
};

export const listOrganizationApps = asyncHandler(
  async (req: OrganizationAccessRequest, res: Response) => {
    const organizationId = req.organizationAccess?.organizationId;
    if (!organizationId) {
      res.status(500).json({
        success: false,
        message: "Organization access middleware is required.",
      });
      return;
    }

    const organizationApps = await prisma.organizationApp.findMany({
      where: {
        organizationId,
        status: OrganizationAppStatus.ACTIVE,
        app: { status: AppStatus.ACTIVE },
      },
      orderBy: { enabledAt: "desc" },
      select: ORGANIZATION_APP_SELECT,
    });

    res.status(200).json({
      success: true,
      data: {
        organizationApps: organizationApps.map(serializeOrganizationApp),
      },
    });
  },
);

export const listAvailableApps = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!ensureAuthenticated(req, res)) return;

    const apps = await prisma.app.findMany({
      where: { status: AppStatus.ACTIVE },
      orderBy: { name: "asc" },
      select: {
        ...APP_SELECT,
        _count: {
          select: {
            organizationApps: true,
            permissions: true,
            roles: true,
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      data: { apps: apps.map(serializeApp) },
    });
  },
);

export const getAppDetailsByKey = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!ensureAuthenticated(req, res)) return;

    const key = appKeyFromValue(req.params.key);
    if (!key) {
      res.status(400).json({ success: false, message: "Invalid app key" });
      return;
    }

  const app = await prisma.app.findUnique({
      where: { key, status: AppStatus.ACTIVE },
      select: {
        ...APP_SELECT,
        _count: {
          select: {
            organizationApps: true,
            permissions: true,
            roles: true,
          },
        },
      },
    });

    if (!app) {
      res.status(404).json({ success: false, message: "App not found" });
      return;
    }

    res.status(200).json({
      success: true,
      data: { app: serializeApp(app) },
    });
  },
);
