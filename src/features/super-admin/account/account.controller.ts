import { Response } from "express";
import asyncHandler from "express-async-handler";
import { SuperAdminStatus } from "../../../generated/prisma/enums.js";
import { SuperAdminAuthRequest } from "../../../middleware/super-admin/superAdminAuth.middleware.js";
import { prisma } from "../../../prisma.js";
import { comparePassword, hashPassword } from "../../../utils/password.js";
import { isUniqueConstraintError } from "../../../utils/prisma.utils.js";
import { isValidEmail } from "../../../utils/validators.js";
import {
  SUPER_ADMIN_SELECT,
  serializeSuperAdmin,
} from "../authentication/super_admin_auth.helpers.js";
import {
  isSuperAdminStatus,
  isValidSuperAdminPassword,
  normalizeText,
  parseSuperAdminId,
  updateStatusSafely,
} from "./account.helpers.js";

export const createSuperAdmin = asyncHandler(
  async (req: SuperAdminAuthRequest, res: Response) => {
    const firstName = normalizeText(req.body.firstName);
    const lastName = normalizeText(req.body.lastName);
    const email = normalizeText(req.body.email).toLowerCase();
    const password =
      typeof req.body.password === "string" ? req.body.password : "";

    if (!firstName || !lastName || !email || !password) {
      res.status(400).json({
        success: false,
        message: "First name, last name, email, and password are required.",
      });
      return;
    }
    if (!isValidEmail(email)) {
      res.status(400).json({
        success: false,
        message: "A valid email address is required.",
      });
      return;
    }
    if (!isValidSuperAdminPassword(password)) {
      res.status(400).json({
        success: false,
        message: "Password must be at least 12 characters.",
      });
      return;
    }

    let superAdmin;
    try {
      superAdmin = await prisma.superAdmin.create({
        data: {
          firstName,
          lastName,
          email,
          password: await hashPassword(password),
        },
        select: SUPER_ADMIN_SELECT,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        res.status(409).json({
          success: false,
          message: "A super-admin account with this email already exists.",
        });
        return;
      }
      throw error;
    }

    res.status(201).json({
      success: true,
      message: "Super-admin account created successfully.",
      data: { superAdmin: serializeSuperAdmin(superAdmin) },
    });
  },
);

export const listSuperAdmins = asyncHandler(async (_req, res) => {
  const superAdmins = await prisma.superAdmin.findMany({
    orderBy: { createdAt: "desc" },
    select: SUPER_ADMIN_SELECT,
  });

  res.status(200).json({
    success: true,
    data: { superAdmins: superAdmins.map(serializeSuperAdmin) },
  });
});

export const updateSuperAdmin = asyncHandler(
  async (req: SuperAdminAuthRequest, res: Response) => {
    const superAdminId = parseSuperAdminId(req.params.superAdminId);
    if (!superAdminId) {
      res.status(400).json({
        success: false,
        message: "Invalid super-admin id.",
      });
      return;
    }

    const existing = await prisma.superAdmin.findUnique({
      where: { id: superAdminId },
      select: { id: true, password: true },
    });
    if (!existing) {
      res.status(404).json({
        success: false,
        message: "Super-admin not found.",
      });
      return;
    }

    const data: {
      firstName?: string;
      lastName?: string;
      email?: string;
      password?: string;
    } = {};

    for (const field of ["firstName", "lastName"] as const) {
      if (field in req.body) {
        const value = normalizeText(req.body[field]);
        if (!value) {
          res.status(400).json({
            success: false,
            message: `${field} cannot be empty.`,
          });
          return;
        }
        data[field] = value;
      }
    }

    if ("email" in req.body) {
      const email = normalizeText(req.body.email).toLowerCase();
      if (!isValidEmail(email)) {
        res.status(400).json({
          success: false,
          message: "A valid email address is required.",
        });
        return;
      }
      data.email = email;
    }

    if ("password" in req.body) {
      if (superAdminId.toString() !== req.superAdminId) {
        res.status(403).json({
          success: false,
          message: "You can only change your own password.",
        });
        return;
      }

      const currentPassword =
        typeof req.body.currentPassword === "string"
          ? req.body.currentPassword
          : "";
      if (
        !currentPassword ||
        !(await comparePassword(currentPassword, existing.password))
      ) {
        res.status(401).json({
          success: false,
          message: "Current password is incorrect.",
        });
        return;
      }

      const password =
        typeof req.body.password === "string" ? req.body.password : "";
      if (!isValidSuperAdminPassword(password)) {
        res.status(400).json({
          success: false,
          message: "Password must be at least 12 characters.",
        });
        return;
      }
      data.password = await hashPassword(password);
    }

    if (!Object.keys(data).length) {
      res.status(400).json({
        success: false,
        message: "Provide at least one super-admin field to update.",
      });
      return;
    }

    let superAdmin;
    try {
      superAdmin = await prisma.superAdmin.update({
        where: { id: superAdminId },
        data,
        select: SUPER_ADMIN_SELECT,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        res.status(409).json({
          success: false,
          message: "A super-admin account with this email already exists.",
        });
        return;
      }
      throw error;
    }

    res.status(200).json({
      success: true,
      message: "Super-admin account updated successfully.",
      data: { superAdmin: serializeSuperAdmin(superAdmin) },
    });
  },
);

export const changeSuperAdminStatus = asyncHandler(
  async (req: SuperAdminAuthRequest, res: Response) => {
    const superAdminId = parseSuperAdminId(req.params.superAdminId);
    if (!superAdminId) {
      res.status(400).json({
        success: false,
        message: "Invalid super-admin id.",
      });
      return;
    }
    if (!isSuperAdminStatus(req.body.status)) {
      res.status(400).json({
        success: false,
        message: "Status must be ACTIVE or DISABLED.",
      });
      return;
    }
    if (
      superAdminId.toString() === req.superAdminId &&
      req.body.status === SuperAdminStatus.DISABLED
    ) {
      res.status(409).json({
        success: false,
        message: "You cannot disable your own super-admin account.",
      });
      return;
    }
    if (
      !(await prisma.superAdmin.findUnique({
        where: { id: superAdminId },
        select: { id: true },
      }))
    ) {
      res.status(404).json({
        success: false,
        message: "Super-admin not found.",
      });
      return;
    }
    const superAdmin = await updateStatusSafely(
      superAdminId,
      req.body.status,
    );
    if (!superAdmin) {
      res.status(409).json({
        success: false,
        message: "At least one active super-admin is required.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Super-admin account status updated successfully.",
      data: { superAdmin: serializeSuperAdmin(superAdmin) },
    });
  },
);
