import { Response } from "express";
import { Prisma } from "../../../generated/prisma/client.js";
import { AppPermissionStatus } from "../../../generated/prisma/enums.js";
import { prisma } from "../../../prisma.js";
import { appKeyFromValue } from "../../../utils/app.utils.js";
import {
  isUniqueConstraintError,
  isWriteConflictError,
} from "../../../utils/prisma.utils.js";
import {
  APP_PERMISSION_SELECT,
  APP_ROLE_SELECT,
  normalizeRbacKey,
} from "../../../utils/rbac.utils.js";

export const runSerializableRbacWrite = async <T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        (isWriteConflictError(error) || isUniqueConstraintError(error)) &&
        attempt < 2
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("Unable to complete role update.");
};

export const findApp = async (value: unknown, res: Response) => {
  const key = appKeyFromValue(value);
  if (!key) {
    res.status(400).json({ success: false, message: "Invalid app key" });
    return null;
  }

  const app = await prisma.app.findUnique({
    where: { key },
    select: { id: true, key: true },
  });
  if (!app) {
    res.status(404).json({ success: false, message: "App not found" });
    return null;
  }
  return app;
};

export const findAppPermission = async (
  appId: bigint,
  value: unknown,
  res: Response,
) => {
  const key = normalizeRbacKey(value);
  if (!key) {
    res.status(400).json({ success: false, message: "Invalid permission key" });
    return null;
  }
  const permission = await prisma.appPermission.findUnique({
    where: { appId_key: { appId, key } },
    select: APP_PERMISSION_SELECT,
  });
  if (!permission) {
    res.status(404).json({ success: false, message: "Permission not found" });
    return null;
  }
  return permission;
};

export const findRole = async (
  appId: bigint,
  value: unknown,
  res: Response,
) => {
  const key = normalizeRbacKey(value, 100);
  if (!key) {
    res.status(400).json({ success: false, message: "Invalid role key" });
    return null;
  }
  const role = await prisma.appRole.findUnique({
    where: { appId_key: { appId, key } },
    select: APP_ROLE_SELECT,
  });
  if (!role) {
    res.status(404).json({ success: false, message: "Role not found" });
    return null;
  }
  return role;
};

export const permissionKeysFromBody = (value: unknown) => {
  if (!Array.isArray(value)) return null;
  const keys = value.map((item) => normalizeRbacKey(item));
  if (keys.some((key) => !key)) return null;
  return [...new Set(keys as string[])];
};

export const activeAppPermissionsForKeys = async (
  appId: bigint,
  keys: string[],
) => {
  if (!keys.length) return [];
  return prisma.appPermission.findMany({
    where: {
      appId,
      key: { in: keys },
      status: AppPermissionStatus.ACTIVE,
    },
    select: { id: true, key: true },
  });
};
