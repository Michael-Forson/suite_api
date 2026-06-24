import { NextFunction, Request, Response } from "express";
import { SuperAdminStatus } from "../../generated/prisma/enums.js";
import { prisma } from "../../prisma.js";
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

    if (decoded.type !== "super-admin" || !decoded.id) {
      res.status(401).json({
        success: false,
        message: "Invalid token type for this resource.",
      });
      return;
    }

    const superAdmin = await prisma.superAdmin.findUnique({
      where: { id: BigInt(decoded.id) },
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

    req.superAdminId = superAdmin.id.toString();
    req.superAdmin = {
      id: superAdmin.id.toString(),
      firstName: superAdmin.firstName,
      lastName: superAdmin.lastName,
      email: superAdmin.email,
    };
    next();
  } catch (error: any) {
    if (error.name !== "TokenExpiredError") {
      console.error("Super-admin token verification error:", error.message);
    }
    res.status(401).json({
      success: false,
      message: "Invalid or expired token.",
    });
  }
};
