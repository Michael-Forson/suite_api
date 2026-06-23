import { Router } from "express";
import { authenticate } from "../../../middleware/users/auth.middleware.js";
import {
  changeOrganizationStatus,
  createOrganization,
  getOrganizationDetails,
  listUserOrganizations,
  updateOrganizationProfile,
} from "./org.controller.js";
import {
  requireOrganizationMembership,
  requireOrganizationOwner,
  requireOrganizationOwnerOrAdmin,
} from "./org.middleware.js";

const router = Router();

router.post("/", authenticate, createOrganization);
router.get("/", authenticate, listUserOrganizations);
router.get(
  "/:organizationId",
  authenticate,
  requireOrganizationMembership,
  getOrganizationDetails,
);
router.patch(
  "/:organizationId/profile",
  authenticate,
  requireOrganizationOwnerOrAdmin,
  updateOrganizationProfile,
);
router.patch(
  "/:organizationId/status",
  authenticate,
  requireOrganizationOwner,
  changeOrganizationStatus,
);

export default router;
