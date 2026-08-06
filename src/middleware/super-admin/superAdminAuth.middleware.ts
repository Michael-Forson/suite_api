import { NextFunction, Request, Response } from "express";
import { SuperAdminStatus } from "../../generated/prisma/enums.js";
import { prisma } from "../../prisma.js";
import { parseId } from "../../utils/parseId.js";
import { isRootSuperAdminEmail } from "../../utils/rootSuperAdmin.js";
import { verifyAccessToken } from "../../utils/tokens.js";

export interface SuperAdminContext {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface SuperAdminAuthRequest extends Request {
  superAdminId?: string;
  superAdmin?: SuperAdminContext;
}

/**
 * Gate for managing other super-admins: inviting, editing someone else,
 * disabling, and mailing reset links are the root account's alone.
 *
 * Runs after `superAdminAuthenticate`, which is what puts the email on the
 * request — root-ness is re-derived from the database record on every call, so a
 * stale token cannot carry it.
 */
export const requireRootSuperAdmin = (
  req: SuperAdminAuthRequest,
  res: Response,
  next: NextFunction,
) => {
  if (!isRootSuperAdminEmail(req.superAdmin?.email)) {
    res.status(403).json({
      success: false,
      message: "Only the root super-admin can manage super-admin accounts.",
    });
    return;
  }

  next();
};

export const superAdminAuthenticate = async (
  req: SuperAdminAuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
    return;
  }

  try {
    const decoded = verifyAccessToken(
      authHeader.substring(7),
      "super-admin",
    ) as { id?: string; type?: string };

    const superAdminId = parseId(decoded.id ?? "");

    if (decoded.type !== "super-admin" || !superAdminId) {
      res.status(401).json({
        success: false,
        message: "Invalid token type for this resource.",
      });
      return;
    }

    const superAdmin = await prisma.superAdmin.findUnique({
      where: { id: superAdminId },
      select: {
        id: true,
        status: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    });

    if (!superAdmin || superAdmin.status !== SuperAdminStatus.ACTIVE) {
      res.status(403).json({
        success: false,
        message: "Super-admin account is not active.",
      });
      return;
    }

    req.superAdminId = superAdmin.id;
    req.superAdmin = {
      id: superAdmin.id,
      firstName: superAdmin.firstName,
      lastName: superAdmin.lastName,
      email: superAdmin.email,
    };
    next();
  } catch (error: any) {
    if (process.env.NODE_ENV !== "test" && error.name !== "TokenExpiredError") {
      console.error("Super-admin token verification error:", error.message);
    }
    res.status(401).json({
      success: false,
      message: "Invalid or expired token.",
    });
  }
};
