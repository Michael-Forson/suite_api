import { Response } from "express";
import asyncHandler from "express-async-handler";
import { Prisma } from "../../../generated/prisma/client.js";
import { AppStatus } from "../../../generated/prisma/enums.js";
import { SuperAdminAuthRequest } from "../../../middleware/super-admin/superAdminAuth.middleware.js";
import { prisma } from "../../../prisma.js";
import {
  APP_SELECT,
  appKeyFromValue,
  isValidAppStatus,
  serializeApp,
  validAppStatuses,
} from "../../core/app/app.helpers.js";
import { normalizeOptionalString } from "../../core/organization/org.helpers.js";

const isUniqueConstraintError = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002";

export const registerApp = asyncHandler(
  async (req: SuperAdminAuthRequest, res: Response) => {
    const name = normalizeOptionalString(req.body.name);
    if (!name || typeof name !== "string") {
      res.status(400).json({ success: false, message: "App name is required" });
      return;
    }

    const key = appKeyFromValue(req.body.key);
    if (!key) {
      res.status(400).json({
        success: false,
        message: "App key is required and must be 100 characters or fewer",
      });
      return;
    }

    const status = req.body.status ?? AppStatus.DISABLED;
    if (!isValidAppStatus(status)) {
      res.status(400).json({
        success: false,
        message: `Status must be one of: ${validAppStatuses()}`,
      });
      return;
    }

    let app;
    try {
      app = await prisma.app.create({
        data: {
          name,
          key,
          description: normalizeOptionalString(req.body.description) as
            | string
            | null,
          iconUrl: normalizeOptionalString(req.body.iconUrl) as string | null,
          appUrl: normalizeOptionalString(req.body.appUrl) as string | null,
          status,
        },
        select: APP_SELECT,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        res.status(409).json({
          success: false,
          message: "App key is already registered",
        });
        return;
      }
      throw error;
    }

    res.status(201).json({
      success: true,
      message: "App registered successfully",
      data: { app: serializeApp(app) },
    });
  },
);

export const listApps = asyncHandler(async (_req, res) => {
  const apps = await prisma.app.findMany({
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
});

export const getAppDetails = asyncHandler(async (req, res) => {
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
});

export const updateAppDetails = asyncHandler(async (req, res) => {
  const key = appKeyFromValue(req.params.key);
  if (!key) {
    res.status(400).json({ success: false, message: "Invalid app key" });
    return;
  }
  if ("key" in req.body) {
    res.status(400).json({
      success: false,
      message: "App key cannot be updated",
    });
    return;
  }

  const data: Record<string, string | null> = {};
  if ("name" in req.body) {
    const name = normalizeOptionalString(req.body.name);
    if (!name || typeof name !== "string") {
      res.status(400).json({
        success: false,
        message: "App name cannot be empty",
      });
      return;
    }
    data.name = name;
  }
  for (const field of ["description", "iconUrl", "appUrl"] as const) {
    if (field in req.body) {
      data[field] = normalizeOptionalString(req.body[field]) as string | null;
    }
  }
  if (!Object.keys(data).length) {
    res.status(400).json({
      success: false,
      message: "Provide at least one app detail to update",
    });
    return;
  }

  if (!(await prisma.app.findUnique({ where: { key }, select: { id: true } }))) {
    res.status(404).json({ success: false, message: "App not found" });
    return;
  }

  const app = await prisma.app.update({
    where: { key },
    data,
    select: APP_SELECT,
  });
  res.status(200).json({
    success: true,
    message: "App details updated successfully",
    data: { app: serializeApp(app) },
  });
});

export const changeAppStatus = asyncHandler(async (req, res) => {
  const key = appKeyFromValue(req.params.key);
  if (!key) {
    res.status(400).json({ success: false, message: "Invalid app key" });
    return;
  }
  if (!isValidAppStatus(req.body.status)) {
    res.status(400).json({
      success: false,
      message: `Status must be one of: ${validAppStatuses()}`,
    });
    return;
  }
  if (!(await prisma.app.findUnique({ where: { key }, select: { id: true } }))) {
    res.status(404).json({ success: false, message: "App not found" });
    return;
  }

  const app = await prisma.app.update({
    where: { key },
    data: { status: req.body.status },
    select: APP_SELECT,
  });
  res.status(200).json({
    success: true,
    message: "App status updated successfully",
    data: { app: serializeApp(app) },
  });
});
