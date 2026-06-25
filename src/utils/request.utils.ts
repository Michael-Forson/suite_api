import { Response } from "express";
import { AuthRequest } from "../middleware/users/auth.middleware.js";
import { parseId } from "./parseId.js";

export const authenticatedUserId = (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
    return null;
  }

  return BigInt(req.userId);
};

export const idFromParams = (id: string | string[] | undefined) =>
  typeof id === "string" ? parseId(id) : null;
