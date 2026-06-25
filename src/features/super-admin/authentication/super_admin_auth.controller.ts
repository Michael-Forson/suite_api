import { Response } from "express";
import asyncHandler from "express-async-handler";
import { SuperAdminStatus } from "../../../generated/prisma/enums.js";
import { SuperAdminAuthRequest } from "../../../middleware/super-admin/superAdminAuth.middleware.js";
import { prisma } from "../../../prisma.js";
import { comparePassword } from "../../../utils/password.js";
import {
  verifyRefreshToken,
} from "../../../utils/tokens.js";
import {
  issueSuperAdminTokens,
  serializeSuperAdmin,
  SUPER_ADMIN_SELECT,
} from "./super_admin_auth.helpers.js";

export const loginSuperAdmin = asyncHandler(async (req, res) => {
  const email =
    typeof req.body.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";

  if (!email || !password) {
    res.status(400).json({
      success: false,
      message: "Email and password are required.",
    });
    return;
  }

  const superAdmin = await prisma.superAdmin.findUnique({
    where: { email },
    select: { ...SUPER_ADMIN_SELECT, password: true },
  });

  if (
    !superAdmin ||
    !(await comparePassword(password, superAdmin.password))
  ) {
    res.status(401).json({
      success: false,
      message: "Invalid email or password.",
    });
    return;
  }

  if (superAdmin.status !== SuperAdminStatus.ACTIVE) {
    res.status(403).json({
      success: false,
      message: "Super-admin account is not active.",
    });
    return;
  }

  const updatedSuperAdmin = await prisma.superAdmin.update({
    where: { id: superAdmin.id },
    data: { lastLoginAt: new Date() },
    select: SUPER_ADMIN_SELECT,
  });

  res.status(200).json({
    success: true,
    message: "Super-admin login successful.",
    data: {
      superAdmin: serializeSuperAdmin(updatedSuperAdmin),
      tokens: issueSuperAdminTokens(updatedSuperAdmin),
    },
  });
});

export const refreshSuperAdminToken = asyncHandler(async (req, res) => {
  const refreshToken =
    typeof req.body.refreshToken === "string" ? req.body.refreshToken : "";

  if (!refreshToken) {
    res.status(400).json({
      success: false,
      message: "Refresh token is required.",
    });
    return;
  }

  try {
    const decoded = verifyRefreshToken(refreshToken, "super-admin") as {
      id?: string;
      type?: string;
    };

    if (decoded.type !== "super-admin" || !decoded.id) {
      res.status(401).json({
        success: false,
        message: "Invalid refresh token.",
      });
      return;
    }

    const superAdmin = await prisma.superAdmin.findUnique({
      where: { id: BigInt(decoded.id) },
      select: SUPER_ADMIN_SELECT,
    });

    if (!superAdmin || superAdmin.status !== SuperAdminStatus.ACTIVE) {
      res.status(403).json({
        success: false,
        message: "Super-admin account is not active.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        superAdmin: serializeSuperAdmin(superAdmin),
        tokens: issueSuperAdminTokens(superAdmin),
      },
    });
  } catch {
    res.status(401).json({
      success: false,
      message: "Invalid or expired refresh token.",
    });
  }
});

export const getSuperAdminProfile = asyncHandler(
  async (req: SuperAdminAuthRequest, res: Response) => {
    const superAdmin = await prisma.superAdmin.findUnique({
      where: { id: BigInt(req.superAdminId!) },
      select: SUPER_ADMIN_SELECT,
    });

    if (!superAdmin) {
      res.status(404).json({
        success: false,
        message: "Super-admin not found.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: { superAdmin: serializeSuperAdmin(superAdmin) },
    });
  },
);
