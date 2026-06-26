import { NextFunction, Response } from "express";
import asyncHandler from "express-async-handler";
import { AuthRequest } from "./auth.middleware.js";
import {
  EffectiveAppAccess,
} from "../../features/core/app-role/app_access.service.js";
import { resolveRequestAccess } from "../../features/core/app-role/app_role.helpers.js";
import type { OrganizationAccessContext } from "../../features/core/organization/org.middleware.js";
import { normalizeRbacKey } from "../../utils/rbac.utils.js";

export interface AppPermissionRequest extends AuthRequest {
  organizationAccess?: OrganizationAccessContext;
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

      const access = req.appAccess ?? (await resolveRequestAccess(req, res));
      if (!access) return;

      if (
        !access.hasAccess ||
        !access.permissions.includes(requiredPermission)
      ) {
        res.status(403).json({
          success: false,
          message: `Missing required app permission: ${requiredPermission}`,
        });
        return;
      }

      req.appAccess = access;
      next();
    },
  );
};
