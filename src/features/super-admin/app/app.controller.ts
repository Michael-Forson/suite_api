import { Response } from "express";
import asyncHandler from "express-async-handler";
import { AppStatus } from "../../../generated/prisma/enums.js";
import { SuperAdminAuthRequest } from "../../../middleware/super-admin/superAdminAuth.middleware.js";
import { prisma } from "../../../prisma.js";
import {
  APP_SELECT,
  appKeyFromValue,
  isValidAppStatus,
  serializeApp,
  validAppStatuses,
} from "../../../utils/app.utils.js";
import { isUniqueConstraintError } from "../../../utils/prisma.utils.js";
import { normalizeOptionalString } from "../../../utils/validation.utils.js";
import { discardAppIcon, storeAppIcon } from "./app.helpers.js";

export const registerApp = asyncHandler(
  async (req: SuperAdminAuthRequest, res: Response) => {
    const name = normalizeOptionalString(req.body.name);
    if (!name || typeof name !== "string") {
      res.status(400).json({ success: false, message: "App name is required" });
      return;
    }

    // Normalized, not just validated: the key is stored lowercased and trimmed,
    // because it becomes a URL path segment everywhere else.
    const key = appKeyFromValue(req.body.key);
    if (!key) {
      res.status(400).json({
        success: false,
        message:
          "App key is required, must be 100 characters or fewer, and may contain only lowercase letters, numbers, dot, underscore, colon or hyphen",
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
    const existingApp = await prisma.app.findUnique({
      where: { key },
      select: { id: true },
    });
    if (existingApp) {
      res.status(409).json({
        success: false,
        message: "App key is already registered",
      });
      return;
    }

    // The icon is stored before the row exists, so a storage failure leaves
    // nothing behind to reconcile. An orphaned object is the cheaper mistake.
    //
    // A body `iconUrl` is stored verbatim: it names an object this API did not
    // upload, so there is no key to reduce it to, and `publicUrl` hands absolute
    // values straight back.
    let iconKey = normalizeOptionalString(req.body.iconUrl) as string | null;
    if (req.file) {
      iconKey = await storeAppIcon(req.file, res);
      if (!iconKey) return;
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
          iconKey,
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
  for (const field of ["description", "appUrl"] as const) {
    if (field in req.body) {
      data[field] = normalizeOptionalString(req.body[field]) as string | null;
    }
  }
  // The request field stays `iconUrl` — clients send an absolute URL or null,
  // never a key, and the column holds whichever of the two it is given.
  if ("iconUrl" in req.body) {
    data.iconKey = normalizeOptionalString(req.body.iconUrl) as string | null;
  }
  // An uploaded file wins over any `iconUrl` in the body — they are two ways to
  // say the same thing, and the file is the deliberate one.
  const hasIconChange = Boolean(req.file) || "iconUrl" in req.body;
  if (!Object.keys(data).length && !req.file) {
    res.status(400).json({
      success: false,
      message: "Provide at least one app detail to update",
    });
    return;
  }

  const existing = await prisma.app.findUnique({
    where: { key },
    select: { id: true, iconKey: true },
  });
  if (!existing) {
    res.status(404).json({ success: false, message: "App not found" });
    return;
  }

  if (req.file) {
    const iconKey = await storeAppIcon(req.file, res);
    if (!iconKey) return;
    data.iconKey = iconKey;
  }

  const app = await prisma.app.update({
    where: { key },
    data,
    select: APP_SELECT,
  });

  // Only after the row points somewhere else. Deleting first would leave a live
  // app pointing at a missing object if the update then failed.
  if (hasIconChange) await discardAppIcon(existing.iconKey, app.iconKey);

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
