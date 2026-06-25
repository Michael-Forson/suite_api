import { Response } from "express";
import { OrganizationRole } from "../../../generated/prisma/enums.js";
import { AuthRequest } from "../../../middleware/users/auth.middleware.js";
import { authenticatedUserId, idFromParams } from "../../../utils/request.utils.js";
import {
  resolveEffectiveAppAccess,
} from "./app_access.service.js";

const appKeyFromParams = (value: string | string[] | undefined) =>
  typeof value === "string" && value.trim() ? value : null;

export const resolveRequestAccess = async (
  req: AuthRequest,
  res: Response,
) => {
  const userId = authenticatedUserId(req, res);
  if (!userId) return null;
  const organizationId = idFromParams(req.params.organizationId);
  const appKey = appKeyFromParams(req.params.appKey);
  if (!organizationId || !appKey) {
    res.status(400).json({
      success: false,
      message: "Invalid organization id or app key",
    });
    return null;
  }
  const result = await resolveEffectiveAppAccess({
    organizationId,
    appKey,
    userId,
  });
  if (!result.ok) {
    res.status(result.error.status).json({
      success: false,
      message: result.error.message,
    });
    return null;
  }
  return result.access;
};

export const requireRoleManager = async (
  req: AuthRequest,
  res: Response,
) => {
  const access = await resolveRequestAccess(req, res);
  if (!access) return null;
  if (
    access.organizationRole !== OrganizationRole.OWNER &&
    access.organizationRole !== OrganizationRole.ADMIN
  ) {
    res.status(403).json({
      success: false,
      message: "Only organization owners and admins can manage app roles.",
    });
    return null;
  }
  return access;
};
