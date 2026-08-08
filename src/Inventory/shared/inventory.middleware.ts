import { Response } from "express";
import {
  AppPermissionRequest,
  requireAppPermission,
} from "../../middleware/users/appPermission.middleware.js";
import { idFromParams } from "../../utils/request.utils.js";
import { badRequest } from "./inventory.errors.js";

/**
 * The inventory app's route guard.
 *
 * Core's `requireAppPermission` reads the app key out of `:appKey` in the URL,
 * which suits `/organizations/:organizationId/apps/:appKey/...` — a generic
 * surface that manages *any* app. Inventory owns its own route tree, so the key
 * is a fact about the code, not an argument: pinning it here keeps
 * `/inventory/units` from having to read `/apps/inventory/units`, and keeps a
 * caller from naming some other app's key on an inventory path.
 *
 * Everything else is core's, unchanged: the org must have the app enabled,
 * owners and admins bypass permission checks, members get whatever their app
 * role grants. See `app_access.service.ts`.
 */
export const INVENTORY_APP_KEY = "inventory";

/** Read anything in the catalog: units, categories, brands. */
export const INVENTORY_CATALOG_READ = "inventory.catalog.read";
export const INVENTORY_UNITS_MANAGE = "inventory.units.manage";
export const INVENTORY_CATEGORIES_MANAGE = "inventory.categories.manage";
export const INVENTORY_BRANDS_MANAGE = "inventory.brands.manage";

export type InventoryRequest = AppPermissionRequest;

export const requireInventoryPermission = (permissionKey: string) =>
  requireAppPermission(permissionKey, { appKey: INVENTORY_APP_KEY });

/**
 * The tenant every service call is scoped to. Taken from the resolved app
 * access rather than the URL or the body, so a request can only ever write to
 * the organization it was authorized against.
 */
export interface InventoryContext {
  organizationId: string;
  userId: string;
}

export const inventoryContext = (
  req: InventoryRequest,
  res: Response,
): InventoryContext | null => {
  const access = req.appAccess;

  if (!access) {
    // Unreachable behind `requireInventoryPermission`; a 500 is honest if a
    // route is ever wired without it.
    res.status(500).json({
      success: false,
      message: "Inventory access was not resolved for this request.",
    });
    return null;
  }

  return { organizationId: access.organizationId, userId: access.userId };
};

/**
 * Path parameter → uuid, or a 400-shaped throw. Every id in this schema is a
 * `@db.Uuid`, so a malformed one is a client mistake, not a missing row —
 * Postgres would otherwise reject the query outright and surface a 500.
 */
export const requireIdParam = (
  value: string | string[] | undefined,
  label: string,
): string => {
  const id = idFromParams(value);
  if (!id) throw badRequest(`A valid ${label} is required`);
  return id;
};
