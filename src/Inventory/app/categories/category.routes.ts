import { Router } from "express";
import { authenticate } from "../../../middleware/users/auth.middleware.js";
import { requireOrganizationMembership } from "../../../core/core-user/organization/org.middleware.js";
import {
  INVENTORY_CATALOG_READ,
  INVENTORY_CATEGORIES_MANAGE,
  requireInventoryPermission,
} from "../../shared/inventory.middleware.js";
import {
  createCategory,
  deleteCategory,
  getCategory,
  getCategoryTree,
  listCategories,
  moveCategory,
  restoreCategory,
  updateCategory,
} from "./category.controller.js";

const router = Router({ mergeParams: true });

router.use(authenticate, requireOrganizationMembership);

router.get(
  "/",
  requireInventoryPermission(INVENTORY_CATALOG_READ),
  listCategories,
);
// Before `/:categoryId`, or "tree" is read as an id.
router.get(
  "/tree",
  requireInventoryPermission(INVENTORY_CATALOG_READ),
  getCategoryTree,
);
router.post(
  "/",
  requireInventoryPermission(INVENTORY_CATEGORIES_MANAGE),
  createCategory,
);
router.get(
  "/:categoryId",
  requireInventoryPermission(INVENTORY_CATALOG_READ),
  getCategory,
);
router.patch(
  "/:categoryId",
  requireInventoryPermission(INVENTORY_CATEGORIES_MANAGE),
  updateCategory,
);
router.patch(
  "/:categoryId/parent",
  requireInventoryPermission(INVENTORY_CATEGORIES_MANAGE),
  moveCategory,
);
router.post(
  "/:categoryId/restore",
  requireInventoryPermission(INVENTORY_CATEGORIES_MANAGE),
  restoreCategory,
);
router.delete(
  "/:categoryId",
  requireInventoryPermission(INVENTORY_CATEGORIES_MANAGE),
  deleteCategory,
);

export default router;
