import { Router } from "express";
import { authenticate } from "../../../middleware/users/auth.middleware.js";
import { requireOrganizationMembership } from "../../../core/core-user/organization/org.middleware.js";
import {
  INVENTORY_BRANDS_MANAGE,
  INVENTORY_CATALOG_READ,
  requireInventoryPermission,
} from "../../shared/inventory.middleware.js";
import {
  createBrand,
  deleteBrand,
  getBrand,
  listBrands,
  restoreBrand,
  updateBrand,
} from "./brand.controller.js";

const router = Router({ mergeParams: true });

router.use(authenticate, requireOrganizationMembership);

router.get("/", requireInventoryPermission(INVENTORY_CATALOG_READ), listBrands);
router.post(
  "/",
  requireInventoryPermission(INVENTORY_BRANDS_MANAGE),
  createBrand,
);
router.get(
  "/:brandId",
  requireInventoryPermission(INVENTORY_CATALOG_READ),
  getBrand,
);
router.patch(
  "/:brandId",
  requireInventoryPermission(INVENTORY_BRANDS_MANAGE),
  updateBrand,
);
router.post(
  "/:brandId/restore",
  requireInventoryPermission(INVENTORY_BRANDS_MANAGE),
  restoreBrand,
);
router.delete(
  "/:brandId",
  requireInventoryPermission(INVENTORY_BRANDS_MANAGE),
  deleteBrand,
);

export default router;
