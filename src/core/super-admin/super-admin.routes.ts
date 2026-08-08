import { Router } from "express";
import superAdminAccountRoutes from "./account/account.routes.js";
import superAdminAppRoutes from "./app/app.routes.js";
import superAdminAuthRoutes from "./authentication/super_admin_auth.routes.js";
import superAdminRbacRoutes from "./rbac/rbac.routes.js";
import superAdminSubscriptionRoutes from "./subscriptions/subscription_admin.routes.js";

/**
 * The super-admin route tree, mounted at `/super-admin/api/v1`.
 *
 * A separate tree from `core-user.routes.ts` because it is a separate audience
 * with a separate token: these endpoints authenticate through
 * `superAdminAuth.middleware.ts` and its own JWT secret, never through a user
 * session.
 */
const router = Router();

router.use("/auth", superAdminAuthRoutes);
router.use("/accounts", superAdminAccountRoutes);
router.use("/subscriptions", superAdminSubscriptionRoutes);

// Both own `/apps`, split by concern: `rbac` manages an app's roles and
// permissions, `app` manages the app records themselves. Their paths do not
// overlap.
router.use("/apps", superAdminRbacRoutes);
router.use("/apps", superAdminAppRoutes);

export default router;
