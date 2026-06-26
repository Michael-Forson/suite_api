import { NextFunction, Response } from "express";
import asyncHandler from "express-async-handler";
import { OrganizationRole } from "../../../generated/prisma/enums.js";
import {
  OrganizationAccessRequest,
  resolveOrganizationAccess,
} from "../organization/org.middleware.js";
import {
  EffectiveAppAccess,
  resolveEffectiveAppAccess,
} from "./app_access.service.js";

const appKeyFromParams = (value: string | string[] | undefined) =>
  typeof value === "string" && value.trim() ? value : null;

export interface AppAccessRequest extends OrganizationAccessRequest {
  appAccess?: EffectiveAppAccess;
}

export const resolveRequestAccess = async (
  req: OrganizationAccessRequest,
  res: Response,
) => {
  const organizationAccess =
    req.organizationAccess ?? (await resolveOrganizationAccess(req, res));
  const appKey = appKeyFromParams(req.params.appKey);
  if (!organizationAccess) return null;
  if (!appKey) {
    res.status(400).json({
      success: false,
      message: "Invalid organization id or app key",
    });
    return null;
  }
  const result = await resolveEffectiveAppAccess({
    organizationAccess,
    appKey,
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

export const attachAppAccess = asyncHandler(
  async (req: AppAccessRequest, res: Response, next: NextFunction) => {
    const access = await resolveRequestAccess(req, res);
    if (!access) return;

    req.appAccess = access;
    next();
  },
);

export const requireRoleManager = async (
  req: AppAccessRequest,
  res: Response,
) => {
  const access = req.appAccess ?? (await resolveRequestAccess(req, res));
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
