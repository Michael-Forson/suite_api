import { Router } from "express";
import { authenticate } from "../../../middleware/users/auth.middleware.js";
import { requireOrganizationMembership } from "../organization/org.middleware.js";
import {
  getAppDetailsByKey,
  listAvailableApps,
  listOrganizationApps,
} from "./app.controller.js";

const router = Router();
export const organizationAppsRouter = Router();

router.get("/", authenticate, listAvailableApps);
router.get("/:key", authenticate, getAppDetailsByKey);

organizationAppsRouter.get(
  "/:organizationId/apps",
  authenticate,
  requireOrganizationMembership,
  listOrganizationApps,
);

export default router;
