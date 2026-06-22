import { Router } from "express";
import { authenticate } from "../../../middleware/users/auth.middleware.js";
import {
  changeMemberRole,
  changeMemberStatus,
  listOrganizationMembers,
  removeOrganizationMember,
  updateMemberJobTitle,
} from "./org_mem.controller.js";

const router = Router();

router.get("/:organizationId/members", authenticate, listOrganizationMembers);
router.patch(
  "/:organizationId/members/:memberId/job-title",
  authenticate,
  updateMemberJobTitle,
);
router.patch(
  "/:organizationId/members/:memberId/role",
  authenticate,
  changeMemberRole,
);
router.patch(
  "/:organizationId/members/:memberId/status",
  authenticate,
  changeMemberStatus,
);
router.delete(
  "/:organizationId/members/:memberId",
  authenticate,
  removeOrganizationMember,
);

export default router;
