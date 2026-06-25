import { Response } from "express";
import asyncHandler from "express-async-handler";
import {
  AppStatus,
  OrganizationAppStatus,
} from "../../../generated/prisma/enums.js";
import { AuthRequest } from "../../../middleware/users/auth.middleware.js";
import { prisma } from "../../../prisma.js";
import {
  APP_SELECT,
  appKeyFromValue,
  serializeApp,
} from "../../../utils/app.utils.js";
import { OrganizationAccessRequest } from "../organization/org.middleware.js";
import {
  ensureAuthenticated,
  ORGANIZATION_APP_SELECT,
  serializeOrganizationApp,
} from "./app.helpers.js";

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
            appPermissions: true,
            appRoles: true,
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
            appPermissions: true,
            appRoles: true,
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
