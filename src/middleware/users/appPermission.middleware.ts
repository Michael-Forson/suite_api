import { NextFunction, Response } from "express";
import asyncHandler from "express-async-handler";
import { AuthRequest } from "./auth.middleware.js";
import {
  EffectiveAppAccess,
  resolveEffectiveAppAccess,
} from "../../features/core/app-role/app_access.service.js";
import { normalizeRbacKey } from "../../utils/rbac.utils.js";
import { idFromParams } from "../../utils/request.utils.js";

export interface AppPermissionRequest extends AuthRequest {
  appAccess?: EffectiveAppAccess;
}

export const requireAppPermission = (permissionKey: string) => {
  const requiredPermission = normalizeRbacKey(permissionKey);
  if (!requiredPermission) {
    throw new Error("A valid permission key is required by the middleware");
  }

  return asyncHandler(
    async (
      req: AppPermissionRequest,
      res: Response,
      next: NextFunction,
    ) => {
      if (!req.userId) {
        res.status(401).json({
          success: false,
          message: "Authentication required.",
        });
        return;
      }
      const organizationId = idFromParams(
        req.params.organizationId,
      );
      const appKey =
        typeof req.params.appKey === "string" ? req.params.appKey : null;
      if (!organizationId || !appKey) {
        res.status(400).json({
          success: false,
          message: "Invalid organization id or app key",
        });
        return;
      }

      const result = await resolveEffectiveAppAccess({
        organizationId,
        appKey,
        userId: BigInt(req.userId),
      });
      if (!result.ok) {
        res.status(result.error.status).json({
          success: false,
          message: result.error.message,
        });
        return;
      }
      if (
        !result.access.hasAccess ||
        !result.access.permissions.includes(requiredPermission)
      ) {
        res.status(403).json({
          success: false,
          message: `Missing required app permission: ${requiredPermission}`,
        });
        return;
      }

      req.appAccess = result.access;
      next();
    },
  );
};
