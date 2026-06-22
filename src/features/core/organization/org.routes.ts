import { Router } from "express";
import { authenticate } from "../../../middleware/users/auth.middleware.js";
import {
  changeOrganizationStatus,
  createOrganization,
  getOrganizationDetails,
  listUserOrganizations,
  updateOrganizationProfile,
} from "./org.controller.js";

const router = Router();

router.post("/", authenticate, createOrganization);
router.get("/", authenticate, listUserOrganizations);
router.get("/:id", authenticate, getOrganizationDetails);
router.patch("/:id/profile", authenticate, updateOrganizationProfile);
router.patch("/:id/status", authenticate, changeOrganizationStatus);

export default router;
