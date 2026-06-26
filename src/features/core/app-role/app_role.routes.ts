import { Router } from "express";
import { authenticate } from "../../../middleware/users/auth.middleware.js";
import {
  requireOrganizationMembership,
  requireOrganizationOwnerOrAdmin,
} from "../organization/org.middleware.js";
import {
  assignMemberAppRole,
  getMyAppAccess,
  listOrganizationAppRoles,
  removeMemberAppRole,
} from "./app_role.controller.js";
import { attachAppAccess } from "./app_role.helpers.js";

const router = Router();

router.get(
  "/:organizationId/apps/:appKey/roles",
  authenticate,
  requireOrganizationOwnerOrAdmin,
  attachAppAccess,
  listOrganizationAppRoles,
);
router.put(
  "/:organizationId/apps/:appKey/members/:memberId/role",
  authenticate,
  requireOrganizationOwnerOrAdmin,
  attachAppAccess,
  assignMemberAppRole,
);
router.delete(
  "/:organizationId/apps/:appKey/members/:memberId/role",
  authenticate,
  requireOrganizationOwnerOrAdmin,
  attachAppAccess,
  removeMemberAppRole,
);
router.get(
  "/:organizationId/apps/:appKey/my-access",
  authenticate,
  requireOrganizationMembership,
  attachAppAccess,
  getMyAppAccess,
);

export default router;
