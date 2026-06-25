import { Router } from "express";
import { superAdminAuthenticate } from "../../../middleware/super-admin/superAdminAuth.middleware.js";
import {
  changeAppPermissionStatus,
  changeRoleStatus,
  createAppPermission,
  createRole,
  listAppPermissions,
  listRoles,
  replaceAppRolePermissions,
  setDefaultRole,
  updateAppPermission,
  updateRole,
} from "./rbac.controller.js";

const router = Router();

router.use(superAdminAuthenticate);

router.get("/:appKey/permissions", listAppPermissions);
router.post("/:appKey/permissions", createAppPermission);
router.patch("/:appKey/permissions/:permissionKey", updateAppPermission);
router.patch(
  "/:appKey/permissions/:permissionKey/status",
  changeAppPermissionStatus,
);

router.get("/:appKey/roles", listRoles);
router.post("/:appKey/roles", createRole);
router.patch("/:appKey/roles/:roleKey", updateRole);
router.put(
  "/:appKey/roles/:roleKey/permissions",
  replaceAppRolePermissions,
);
router.patch("/:appKey/roles/:roleKey/default", setDefaultRole);
router.patch("/:appKey/roles/:roleKey/status", changeRoleStatus);

export default router;
