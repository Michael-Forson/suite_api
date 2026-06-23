import { Router } from "express";
import { authenticate } from "../../../middleware/users/auth.middleware.js";
import { requireOrganizationMembership } from "../organization/org.middleware.js";
import {
  changeAppStatus,
  getAppDetailsByKey,
  listAvailableApps,
  listOrganizationApps,
  registerApp,
  updateAppDetails,
} from "./app.controller.js";

const router = Router();
export const organizationAppsRouter = Router();

router.post("/", authenticate, registerApp);
router.get("/", authenticate, listAvailableApps);
router.get("/:key", authenticate, getAppDetailsByKey);
router.patch("/:key/details", authenticate, updateAppDetails);
router.patch("/:key/status", authenticate, changeAppStatus);

organizationAppsRouter.get(
  "/:organizationId/apps",
  authenticate,
  requireOrganizationMembership,
  listOrganizationApps,
);

export default router;
