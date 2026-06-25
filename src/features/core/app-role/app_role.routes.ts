import { Router } from "express";
import { authenticate } from "../../../middleware/users/auth.middleware.js";
import {
  assignMemberAppRole,
  getMyAppAccess,
  listOrganizationAppRoles,
  removeMemberAppRole,
} from "./app_role.controller.js";

const router = Router();

router.get(
  "/:organizationId/apps/:appKey/roles",
  authenticate,
  listOrganizationAppRoles,
);
router.put(
  "/:organizationId/apps/:appKey/members/:memberId/role",
  authenticate,
  assignMemberAppRole,
);
router.delete(
  "/:organizationId/apps/:appKey/members/:memberId/role",
  authenticate,
  removeMemberAppRole,
);
router.get(
  "/:organizationId/apps/:appKey/my-access",
  authenticate,
  getMyAppAccess,
);

export default router;
