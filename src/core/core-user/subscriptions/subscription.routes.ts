import { Router } from "express";
import { authenticate } from "../../../middleware/users/auth.middleware.js";
import {
  requireOrganizationMembership,
  requireOrganizationOwnerOrAdmin,
} from "../organization/org.middleware.js";
import {
  checkoutSubscription,
  getCurrentSubscription,
  handleStripeWebhook,
  listSubscriptionPlans,
} from "./subscription.controller.js";

export const organizationSubscriptionRoutes = Router();
export const subscriptionWebhookRoutes = Router();

organizationSubscriptionRoutes.get(
  "/:organizationId/subscriptions/plans",
  authenticate,
  requireOrganizationMembership,
  listSubscriptionPlans,
);

organizationSubscriptionRoutes.get(
  "/:organizationId/subscriptions/current",
  authenticate,
  requireOrganizationMembership,
  getCurrentSubscription,
);

organizationSubscriptionRoutes.post(
  "/:organizationId/subscriptions/checkout",
  authenticate,
  requireOrganizationOwnerOrAdmin,
  checkoutSubscription,
);

subscriptionWebhookRoutes.post("/stripe/webhook", handleStripeWebhook);
