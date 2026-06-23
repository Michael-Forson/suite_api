import { Response } from "express";
import asyncHandler from "express-async-handler";
import {
  AppStatus,
  OrganizationAppStatus,
} from "../../../generated/prisma/enums.js";
import { AuthRequest } from "../../../middleware/users/auth.middleware.js";
import { prisma } from "../../../prisma.js";
import { normalizeOptionalString } from "../organization/org.helpers.js";
import { OrganizationAccessRequest } from "../organization/org.middleware.js";
import {
  APP_SELECT,
  appKeyFromValue,
  isValidAppStatus,
  serializeApp,
  validAppStatuses,
} from "./app.helpers.js";
import {
  ChangeAppStatusRequestBody,
  RegisterAppRequestBody,
  UpdateAppDetailsRequestBody,
} from "./app.types.js";

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

export const registerApp = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!ensureAuthenticated(req, res)) return;

    const body: RegisterAppRequestBody = req.body;
    const name = normalizeOptionalString(body.name);
    if (!name || typeof name !== "string") {
      res.status(400).json({ success: false, message: "App name is required" });
      return;
    }

    const key = appKeyFromValue(body.key);
    if (!key) {
      res.status(400).json({
        success: false,
        message: "App key is required and must be 100 characters or fewer",
      });
      return;
    }

    const status = body.status ?? AppStatus.ACTIVE;
    if (!isValidAppStatus(status)) {
      res.status(400).json({
        success: false,
        message: `Status must be one of: ${validAppStatuses()}`,
      });
      return;
    }

    const existing = await prisma.app.findUnique({
      where: { key },
      select: { id: true },
    });

    if (existing) {
      res.status(409).json({
        success: false,
        message: "App key is already registered",
      });
      return;
    }

    const app = await prisma.app.create({
      data: {
        name,
        key,
        description: normalizeOptionalString(body.description) as string | null,
        iconUrl: normalizeOptionalString(body.iconUrl) as string | null,
        appUrl: normalizeOptionalString(body.appUrl) as string | null,
        status,
      },
      select: APP_SELECT,
    });

    res.status(201).json({
      success: true,
      message: "App registered successfully",
      data: { app: serializeApp(app) },
    });
  },
);

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

export const updateAppDetails = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!ensureAuthenticated(req, res)) return;

    const currentKey = appKeyFromValue(req.params.key);
    if (!currentKey) {
      res.status(400).json({ success: false, message: "Invalid app key" });
      return;
    }

    const body: UpdateAppDetailsRequestBody = req.body;
    const data: Record<string, string | null> = {};

    if ("key" in body) {
      res.status(400).json({
        success: false,
        message: "App key cannot be updated",
      });
      return;
    }

    if ("name" in body) {
      const name = normalizeOptionalString(body.name);
      if (!name || typeof name !== "string") {
        res.status(400).json({
          success: false,
          message: "App name cannot be empty",
        });
        return;
      }
      data.name = name;
    }

    const current = await prisma.app.findUnique({
      where: { key: currentKey },
      select: { id: true },
    });

    if (!current) {
      res.status(404).json({ success: false, message: "App not found" });
      return;
    }

    for (const field of ["description", "iconUrl", "appUrl"] as const) {
      if (field in body) {
        data[field] = normalizeOptionalString(body[field]) as string | null;
      }
    }

    if (!Object.keys(data).length) {
      res.status(400).json({
        success: false,
        message: "Provide at least one app detail to update",
      });
      return;
    }

    const app = await prisma.app.update({
      where: { key: currentKey },
      data,
      select: APP_SELECT,
    });

    res.status(200).json({
      success: true,
      message: "App details updated successfully",
      data: { app: serializeApp(app) },
    });
  },
);

export const changeAppStatus = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!ensureAuthenticated(req, res)) return;

    const key = appKeyFromValue(req.params.key);
    if (!key) {
      res.status(400).json({ success: false, message: "Invalid app key" });
      return;
    }

    const { status }: ChangeAppStatusRequestBody = req.body;
    if (!isValidAppStatus(status)) {
      res.status(400).json({
        success: false,
        message: `Status must be one of: ${validAppStatuses()}`,
      });
      return;
    }

    const existing = await prisma.app.findUnique({
      where: { key },
      select: { id: true },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: "App not found" });
      return;
    }

    const app = await prisma.app.update({
      where: { key },
      data: { status },
      select: APP_SELECT,
    });

    res.status(200).json({
      success: true,
      message: "App status updated successfully",
      data: { app: serializeApp(app) },
    });
  },
);

export const listAvailableApps = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!ensureAuthenticated(req, res)) return;

    const includeDisabled = req.query.includeDisabled === "true";

    const apps = await prisma.app.findMany({
      where: {
        ...(includeDisabled ? {} : { status: AppStatus.ACTIVE }),
      },
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
      where: { key },
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
