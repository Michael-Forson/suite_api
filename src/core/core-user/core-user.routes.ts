import { Router } from "express";
import configRoutes from "../config/config.routes.js";
import notificationRoutes from "../config/notification/notification.router.js";
import paymentRoutes from "../config/payments/payment.routes.js";
import appRoleRoutes from "./app-role/app_role.routes.js";
import appRoutes, { organizationAppsRouter } from "./app/app.routes.js";
import authRoutes from "./authentication/auth.routes.js";
import organizationInvitationRoutes from "./organization-invitation/org_inv.routes.js";
import organizationMemberRoutes from "./organization-member/org_mem.routes.js";
import organizationRoutes from "./organization/org.routes.js";
import { subscriptionWebhookRoutes, organizationSubscriptionRoutes } from "./subscriptions/subscription.routes.js";

/**
 * The core app's user-facing route tree, mounted at `/user/api/v1`.
 *
 * The sibling of `super-admin.routes.ts` and of the inventory app's
 * `inventory.routes.ts`: each app assembles its own routes and hands `createApp`
 * one router, so adding an endpoint never means editing the application entry
 * point.
 *
 * The `config`, `payments` and `notification` routers live under `core/config`
 * rather than here, but they are part of the same `/user/api/v1` surface, so
 * this is where they get mounted. The alternative — a third aggregator for three
 * mounts — buys nothing.
 *
 * Not here: the raw-body handlers for the Paystack and Stripe webhooks. Those
 * must run before `express.json()` parses the request, which makes them a
 * body-parsing concern of the application rather than a route, so they stay in
 * `createApp`.
 */
const router = Router();

router.use("/config", configRoutes);
router.use("/auth", authRoutes);
router.use("/apps", appRoutes);

// Five routers share `/organizations`. Each owns a distinct sub-path, so the
// order among them is not load-bearing — `org.routes.ts` matches
// `/:organizationId` and a fixed set of children, never a wildcard that could
// swallow another's path.
router.use("/organizations", organizationInvitationRoutes);
router.use("/organizations", organizationMemberRoutes);
router.use("/organizations", organizationSubscriptionRoutes);
router.use("/organizations", organizationAppsRouter);
router.use("/organizations", appRoleRoutes);
router.use("/organizations", organizationRoutes);

router.use("/payments", paymentRoutes);
router.use("/subscriptions", subscriptionWebhookRoutes);
router.use("/notifications", notificationRoutes);

export default router;
