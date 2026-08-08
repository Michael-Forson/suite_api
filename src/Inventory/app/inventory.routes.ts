import { Router } from "express";
import brandRoutes from "./brands/brand.routes.js";
import categoryRoutes from "./categories/category.routes.js";
import unitRoutes from "./unit/unit.routes.js";

/**
 * The inventory app's route tree, mounted at `/user/api/v1` — the same way
 * `core-user.routes.ts` is, so `createApp` treats every app alike and never
 * needs to know an app's internal paths.
 *
 * Every path is `/organizations/:organizationId/inventory/...` — the org id in
 * the URL, the app key nowhere. Core's generic app surface spells the key into
 * the path (`/apps/:appKey/roles`) because it manages any app; this router only
 * ever serves one, so `shared/inventory.middleware.ts` pins it. See the note
 * there.
 */
const router = Router();

const INVENTORY_BASE = "/organizations/:organizationId/inventory";

router.use(`${INVENTORY_BASE}/units`, unitRoutes);
router.use(`${INVENTORY_BASE}/categories`, categoryRoutes);
router.use(`${INVENTORY_BASE}/brands`, brandRoutes);

export default router;
