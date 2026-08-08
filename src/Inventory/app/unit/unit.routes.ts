import { Router } from "express";
import { authenticate } from "../../../middleware/users/auth.middleware.js";
import { requireOrganizationMembership } from "../../../core/core-user/organization/org.middleware.js";
import {
  INVENTORY_CATALOG_READ,
  INVENTORY_UNITS_MANAGE,
  requireInventoryPermission,
} from "../../shared/inventory.middleware.js";
import {
  createUnit,
  deleteUnit,
  getUnit,
  listUnits,
  restoreUnit,
  seedDefaultUnits,
  updateUnit,
} from "./unit.controller.js";

// `mergeParams` so `:organizationId` from the parent mount reaches
// `requireOrganizationMembership`, which reads it from `req.params`.
const router = Router({ mergeParams: true });

router.use(authenticate, requireOrganizationMembership);

router.get("/", requireInventoryPermission(INVENTORY_CATALOG_READ), listUnits);
router.post(
  "/",
  requireInventoryPermission(INVENTORY_UNITS_MANAGE),
  createUnit,
);
router.post(
  "/seed-defaults",
  requireInventoryPermission(INVENTORY_UNITS_MANAGE),
  seedDefaultUnits,
);
router.get(
  "/:unitId",
  requireInventoryPermission(INVENTORY_CATALOG_READ),
  getUnit,
);
router.patch(
  "/:unitId",
  requireInventoryPermission(INVENTORY_UNITS_MANAGE),
  updateUnit,
);
router.post(
  "/:unitId/restore",
  requireInventoryPermission(INVENTORY_UNITS_MANAGE),
  restoreUnit,
);
router.delete(
  "/:unitId",
  requireInventoryPermission(INVENTORY_UNITS_MANAGE),
  deleteUnit,
);

export default router;
