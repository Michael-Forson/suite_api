import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../../utils/tokens.js";
import { AdminRole } from "../../generated/prisma/client.js";

/**
 * The minimal "admin context" attached to req. Derived from JWT claims —
 * no DB lookup. For full profile fields, controllers must query themselves
 * (e.g. getAdminProfile). Freshness of role / isActive is enforced at token
 * refresh time, not per-request.
 */
export interface AdminContext {
  id: string;
  role: AdminRole;
  firstName: string;
  lastName: string;
  email: string;
}

export interface AdminAuthRequest extends Request {
  adminId?: string;
  admin?: AdminContext;
}

export const adminAuthenticate = (
  req: AdminAuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ success: false, message: "Authentication required." });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = verifyAccessToken(token) as {
      id?: string;
      type?: string;
      role?: AdminRole;
      firstName?: string;
      lastName?: string;
      email?: string;
    };

    if (decoded.type !== "admin") {
      res.status(401).json({ success: false, message: "Invalid token type for this resource." });
      return;
    }

    if (!decoded.id || !decoded.role) {
      res.status(401).json({
        success: false,
        message: "Outdated token. Please login again.",
      });
      return;
    }

    req.adminId = decoded.id;
    req.admin = {
      id: decoded.id,
      role: decoded.role,
      firstName: decoded.firstName ?? "",
      lastName: decoded.lastName ?? "",
      email: decoded.email ?? "",
    };
    next();
  } catch (error: any) {
    if (error.name !== "TokenExpiredError") {
      console.error("Admin token verification error:", error.message);
    }
    res.status(401).json({ success: false, message: "Invalid or expired token." });
  }
};

export const requireRole = (...roles: AdminRole[]) =>
  (req: AdminAuthRequest, res: Response, next: NextFunction) => {
    if (!req.admin || !roles.includes(req.admin.role)) {
      res.status(403).json({ success: false, message: "Insufficient permissions." });
      return;
    }
    next();
  };
