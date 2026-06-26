import { Request, Response, NextFunction } from "express";
import {
  UserOrgAccessClaim,
  verifyAccessToken,
} from "../../utils/tokens.js";

export interface AuthRequest extends Request {
  userId?: string;
  orgAccessClaims?: UserOrgAccessClaim[];
}

const claimsFromDecodedToken = (decoded: { orgs?: unknown }) =>
  Array.isArray(decoded.orgs)
    ? (decoded.orgs as UserOrgAccessClaim[])
    : undefined;

/**
 * Optional authentication - sets req.userId if a valid token is present,
 * but allows the request to proceed without one.
 */
export const optionalAuthenticate = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const token = authHeader.substring(7);
      const decoded = verifyAccessToken(token, "user") as {
        id: string;
        type?: string;
        orgs?: unknown;
      };
      if (decoded.type === "user") {
        req.userId = decoded.id;
        req.orgAccessClaims = claimsFromDecodedToken(decoded);
      }
    } catch {
      // Token invalid/expired — proceed without userId
    }
  }

  next();
};

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      message: "Authentication required. Please provide a valid token.",
    });
    return;
  }

  const token = authHeader.substring(7); // Remove "Bearer " prefix

  try {
    const decoded = verifyAccessToken(token, "user") as {
      id: string;
      type?: string;
      orgs?: unknown;
    };

    if (decoded.type !== "user") {
      res.status(401).json({
        success: false,
        message: "Invalid token type for this resource.",
      });
      return;
    }

    const userId = decoded.id;

    req.userId = userId;
    req.orgAccessClaims = claimsFromDecodedToken(decoded);
    next();
  } catch (error: any) {
    // Differentiate between expected token expiration vs actual errors
    if (error.name === "TokenExpiredError") {
    } else {
      // Log other errors (invalid signature, malformed token, etc.)
      console.error("Token verification error:", {
        message: error.message,
        name: error.name,
      });
    }

    res.status(401).json({
      success: false,
      message: "Invalid or expired token. Please login again.",
    });
    return;
  }
};
