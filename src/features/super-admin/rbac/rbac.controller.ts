import asyncHandler from "express-async-handler";
import {
  AppPermissionStatus,
  RoleStatus,
} from "../../../generated/prisma/enums.js";
import { prisma } from "../../../prisma.js";
import {
  APP_ROLE_SELECT,
  normalizeRbacKey,
  APP_PERMISSION_SELECT,
  serializeAppRole,
  serializeAppPermission,
} from "../../../utils/rbac.utils.js";
import {
  normalizeNullableText,
  normalizeRequiredText,
} from "../../../utils/validation.utils.js";
import { isUniqueConstraintError } from "../../../utils/prisma.utils.js";
import {
  activeAppPermissionsForKeys,
  findApp,
  findAppPermission,
  findRole,
  permissionKeysFromBody,
  runSerializableRbacWrite,
} from "./rbac.helpers.js";

export const listAppPermissions = asyncHandler(async (req, res) => {
  const app = await findApp(req.params.appKey, res);
  if (!app) return;

  const permissions = await prisma.appPermission.findMany({
    where: { appId: app.id },
    orderBy: [{ category: "asc" }, { key: "asc" }],
    select: APP_PERMISSION_SELECT,
  });
  res.status(200).json({
    success: true,
    data: { permissions: permissions.map(serializeAppPermission) },
  });
});

export const createAppPermission = asyncHandler(async (req, res) => {
  const app = await findApp(req.params.appKey, res);
  if (!app) return;

  const key = normalizeRbacKey(req.body.key);
  const label = normalizeRequiredText(req.body.label, 150);
  if (!key || !label) {
    res.status(400).json({
      success: false,
      message: "A valid permission key and label are required",
    });
    return;
  }

  const description = normalizeNullableText(req.body.description);
  const category = normalizeNullableText(req.body.category, 100);
  if (description === undefined || category === undefined) {
    res.status(400).json({
      success: false,
      message: "Invalid permission description or category",
    });
    return;
  }

  try {
    const permission = await prisma.appPermission.create({
      data: {
        appId: app.id,
        key,
        label,
        description,
        category,
        isSystemPermission: true,
      },
      select: APP_PERMISSION_SELECT,
    });
    res.status(201).json({
      success: true,
      message: "Permission created successfully",
      data: { permission: serializeAppPermission(permission) },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({
        success: false,
        message: "Permission key already exists for this app",
      });
      return;
    }
    throw error;
  }
});

export const updateAppPermission = asyncHandler(async (req, res) => {
  const app = await findApp(req.params.appKey, res);
  if (!app) return;
  const permission = await findAppPermission(
    app.id,
    req.params.permissionKey,
    res,
  );
  if (!permission) return;
  if ("key" in req.body) {
    res.status(400).json({
      success: false,
      message: "Permission key cannot be updated",
    });
    return;
  }

  const data: {
    label?: string;
    description?: string | null;
    category?: string | null;
  } = {};
  if ("label" in req.body) {
    const label = normalizeRequiredText(req.body.label, 150);
    if (!label) {
      res.status(400).json({ success: false, message: "Invalid label" });
      return;
    }
    data.label = label;
  }
  for (const field of ["description", "category"] as const) {
    if (field in req.body) {
      const value = normalizeNullableText(
        req.body[field],
        field === "category" ? 100 : undefined,
      );
      if (value === undefined) {
        res.status(400).json({
          success: false,
          message: `Invalid permission ${field}`,
        });
        return;
      }
      data[field] = value;
    }
  }
  if (!Object.keys(data).length) {
    res.status(400).json({
      success: false,
      message: "Provide at least one permission detail to update",
    });
    return;
  }

  const updated = await prisma.appPermission.update({
    where: { id: permission.id },
    data,
    select: APP_PERMISSION_SELECT,
  });
  res.status(200).json({
    success: true,
    message: "Permission updated successfully",
    data: { permission: serializeAppPermission(updated) },
  });
});

export const changeAppPermissionStatus = asyncHandler(async (req, res) => {
  const app = await findApp(req.params.appKey, res);
  if (!app) return;
  const permission = await findAppPermission(
    app.id,
    req.params.permissionKey,
    res,
  );
  if (!permission) return;
  if (!Object.values(AppPermissionStatus).includes(req.body.status)) {
    res.status(400).json({
      success: false,
      message: `Status must be one of: ${Object.values(AppPermissionStatus).join(", ")}`,
    });
    return;
  }

  const updated = await prisma.appPermission.update({
    where: { id: permission.id },
    data: { status: req.body.status },
    select: APP_PERMISSION_SELECT,
  });
  res.status(200).json({
    success: true,
    message: "Permission status updated successfully",
    data: { permission: serializeAppPermission(updated) },
  });
});

export const listRoles = asyncHandler(async (req, res) => {
  const app = await findApp(req.params.appKey, res);
  if (!app) return;
  const roles = await prisma.appRole.findMany({
    where: { appId: app.id },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: APP_ROLE_SELECT,
  });
  res.status(200).json({
    success: true,
    data: { roles: roles.map(serializeAppRole) },
  });
});

export const createRole = asyncHandler(async (req, res) => {
  const app = await findApp(req.params.appKey, res);
  if (!app) return;
  const key = normalizeRbacKey(req.body.key, 100);
  const name = normalizeRequiredText(req.body.name, 150);
  const permissionKeys =
    req.body.permissionKeys === undefined
      ? []
      : permissionKeysFromBody(req.body.permissionKeys);
  if (!key || !name || !permissionKeys) {
    res.status(400).json({
      success: false,
      message: "A valid role key, name, and permissionKeys array are required",
    });
    return;
  }
  const description = normalizeNullableText(req.body.description);
  if (description === undefined) {
    res.status(400).json({ success: false, message: "Invalid description" });
    return;
  }

  const permissions = await activeAppPermissionsForKeys(app.id, permissionKeys);
  if (permissions.length !== permissionKeys.length) {
    const foundKeys = new Set(permissions.map((p) => p.key));
    const missing = permissionKeys.filter((k) => !foundKeys.has(k));
    res.status(400).json({
      success: false,
      message: `Unknown or inactive permission keys: ${missing.join(", ")}`,
    });
    return;
  }

  try {
    const role = await prisma.appRole.create({
      data: {
        appId: app.id,
        key,
        name,
        description,
        appRolePermissions: {
          create: permissions.map((permission) => ({
            appPermissionId: permission.id,
          })),
        },
      },
      select: APP_ROLE_SELECT,
    });
    res.status(201).json({
      success: true,
      message: "Role created successfully",
      data: { role: serializeAppRole(role) },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({
        success: false,
        message: "Role key or name already exists for this app",
      });
      return;
    }
    throw error;
  }
});

export const updateRole = asyncHandler(async (req, res) => {
  const app = await findApp(req.params.appKey, res);
  if (!app) return;
  const role = await findRole(app.id, req.params.roleKey, res);
  if (!role) return;
  if ("key" in req.body) {
    res.status(400).json({
      success: false,
      message: "Role key cannot be updated",
    });
    return;
  }

  const data: { name?: string; description?: string | null } = {};
  if ("name" in req.body) {
    const name = normalizeRequiredText(req.body.name, 150);
    if (!name) {
      res.status(400).json({ success: false, message: "Invalid role name" });
      return;
    }
    data.name = name;
  }
  if ("description" in req.body) {
    const description = normalizeNullableText(req.body.description);
    if (description === undefined) {
      res.status(400).json({ success: false, message: "Invalid description" });
      return;
    }
    data.description = description;
  }
  if (!Object.keys(data).length) {
    res.status(400).json({
      success: false,
      message: "Provide at least one role detail to update",
    });
    return;
  }

  try {
    const updated = await prisma.appRole.update({
      where: { id: role.id },
      data,
      select: APP_ROLE_SELECT,
    });
    res.status(200).json({
      success: true,
      message: "Role updated successfully",
      data: { role: serializeAppRole(updated) },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({
        success: false,
        message: "Role name already exists for this app",
      });
      return;
    }
    throw error;
  }
});

export const replaceAppRolePermissions = asyncHandler(async (req, res) => {
  const app = await findApp(req.params.appKey, res);
  if (!app) return;
  const role = await findRole(app.id, req.params.roleKey, res);
  if (!role) return;
  const permissionKeys = permissionKeysFromBody(req.body.permissionKeys);
  if (!permissionKeys) {
    res.status(400).json({
      success: false,
      message: "permissionKeys must be an array of valid permission keys",
    });
    return;
  }
  const permissions = await activeAppPermissionsForKeys(app.id, permissionKeys);
  if (permissions.length !== permissionKeys.length) {
    const foundKeys = new Set(permissions.map((p) => p.key));
    const missing = permissionKeys.filter((k) => !foundKeys.has(k));
    res.status(400).json({
      success: false,
      message: `Unknown or inactive permission keys: ${missing.join(", ")}`,
    });
    return;
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.appRolePermission.deleteMany({ where: { appRoleId: role.id } });
    if (permissions.length) {
      await tx.appRolePermission.createMany({
        data: permissions.map((permission) => ({
          appRoleId: role.id,
          appPermissionId: permission.id,
        })),
      });
    }
    return tx.appRole.findUniqueOrThrow({
      where: { id: role.id },
      select: APP_ROLE_SELECT,
    });
  });
  res.status(200).json({
    success: true,
    message: "Role permissions updated successfully",
    data: { role: serializeAppRole(updated) },
  });
});

export const setDefaultRole = asyncHandler(async (req, res) => {
  const app = await findApp(req.params.appKey, res);
  if (!app) return;
  const role = await findRole(app.id, req.params.roleKey, res);
  if (!role) return;
  if (role.status !== RoleStatus.ACTIVE) {
    res.status(409).json({
      success: false,
      message: "Only an active role can be the default role",
    });
    return;
  }

  const updated = await runSerializableRbacWrite(async (tx) => {
    const currentRole = await tx.appRole.findUnique({
      where: { id: role.id },
      select: { status: true },
    });
    if (!currentRole || currentRole.status !== RoleStatus.ACTIVE) return null;

    await tx.appRole.updateMany({
      where: { appId: app.id, isDefault: true, id: { not: role.id } },
      data: { isDefault: false },
    });
    return tx.appRole.update({
      where: { id: role.id },
      data: { isDefault: true },
      select: APP_ROLE_SELECT,
    });
  });
  if (!updated) {
    res.status(409).json({
      success: false,
      message: "Only an active role can be the default role",
    });
    return;
  }
  res.status(200).json({
    success: true,
    message: "Default role updated successfully",
    data: { role: serializeAppRole(updated) },
  });
});

export const changeRoleStatus = asyncHandler(async (req, res) => {
  const app = await findApp(req.params.appKey, res);
  if (!app) return;
  const role = await findRole(app.id, req.params.roleKey, res);
  if (!role) return;
  if (!Object.values(RoleStatus).includes(req.body.status)) {
    res.status(400).json({
      success: false,
      message: `Status must be one of: ${Object.values(RoleStatus).join(", ")}`,
    });
    return;
  }
  const updated = await runSerializableRbacWrite(async (tx) => {
    const currentRole = await tx.appRole.findUnique({
      where: { id: role.id },
      select: { isDefault: true },
    });
    if (
      !currentRole ||
      (currentRole.isDefault && req.body.status === RoleStatus.DISABLED)
    ) {
      return null;
    }
    return tx.appRole.update({
      where: { id: role.id },
      data: { status: req.body.status },
      select: APP_ROLE_SELECT,
    });
  });
  if (!updated) {
    res.status(409).json({
      success: false,
      message: "Select another default role before disabling this role",
    });
    return;
  }
  res.status(200).json({
    success: true,
    message: "Role status updated successfully",
    data: { role: serializeAppRole(updated) },
  });
});
