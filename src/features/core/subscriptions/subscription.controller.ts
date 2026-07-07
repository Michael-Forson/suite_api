import { Response } from "express";
import asyncHandler from "express-async-handler";
import { AuthRequest } from "../../../middleware/users/auth.middleware.js";
import { OrganizationAccessRequest } from "../organization/org.middleware.js";
import {
  normalizePlanKey,
  parseBillingInterval,
} from "./subscription.helpers.js";
import {
  createSubscriptionCheckout,
  listSubscriptionPlansForOrganization,
  processStripeCheckoutCompleted,
  processStripeSubscriptionObject,
  serializeCurrentSubscription,
  serializeServiceError,
} from "./subscription.service.js";
import { stripeService } from "../../../services/stripe/stripe.service.js";
import { SubscriptionStatus } from "../../../generated/prisma/enums.js";

const respondWithError = (res: Response, error: any) => {
  const { status, body } = serializeServiceError(error);
  res.status(status).json(body);
};

export const listSubscriptionPlans = asyncHandler(
  async (req: OrganizationAccessRequest, res: Response) => {
    const organizationId = req.organizationAccess?.organizationId;
    if (!organizationId) {
      res.status(500).json({
        success: false,
        message: "Organization access middleware is required.",
      });
      return;
    }

    const interval = parseBillingInterval(req.query.interval);
    if (!interval) {
      res.status(400).json({
        success: false,
        message: "interval must be month or year",
      });
      return;
    }

    try {
      const data = await listSubscriptionPlansForOrganization({
        organizationId,
        interval,
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      respondWithError(res, error);
    }
  },
);

export const checkoutSubscription = asyncHandler(
  async (req: OrganizationAccessRequest, res: Response) => {
    const organizationId = req.organizationAccess?.organizationId;
    const userId = req.organizationAccess?.userId;
    if (!organizationId || !userId) {
      res.status(500).json({
        success: false,
        message: "Organization owner/admin middleware is required.",
      });
      return;
    }

    const planKey = normalizePlanKey(req.body.planKey);
    const interval = parseBillingInterval(req.body.interval);
    if (!planKey || !interval) {
      res.status(400).json({
        success: false,
        message: "planKey and interval are required",
      });
      return;
    }

    try {
      const data = await createSubscriptionCheckout({
        organizationId,
        userId,
        planKey,
        interval,
      });
      res.status(200).json({
        success: true,
        message: "Subscription checkout created successfully",
        data,
      });
    } catch (error) {
      respondWithError(res, error);
    }
  },
);

export const getCurrentSubscription = asyncHandler(
  async (req: OrganizationAccessRequest, res: Response) => {
    const organizationId = req.organizationAccess?.organizationId;
    if (!organizationId) {
      res.status(500).json({
        success: false,
        message: "Organization access middleware is required.",
      });
      return;
    }

    const subscription = await serializeCurrentSubscription(organizationId);
    res.status(200).json({
      success: true,
      data: { subscription },
    });
  },
);

export const handleStripeWebhook = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const signature = req.headers["stripe-signature"] as string | undefined;
    if (!signature) {
      res.status(400).json({
        success: false,
        message: "Missing stripe-signature header",
      });
      return;
    }

    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    if (!stripeService.verifyWebhookSignature(rawBody, signature)) {
      res.status(401).json({
        success: false,
        message: "Invalid Stripe webhook signature",
      });
      return;
    }

    const event = stripeService.parseWebhookEvent(req.body);
    switch (event.type) {
      case "checkout.session.completed":
        await processStripeCheckoutCompleted(event.data.object);
        break;
      case "customer.subscription.updated":
        await processStripeSubscriptionObject({
          subscription: event.data.object,
        });
        break;
      case "customer.subscription.deleted":
        await processStripeSubscriptionObject({
          subscription: event.data.object,
          fallbackStatus: SubscriptionStatus.CANCELED,
        });
        break;
      case "invoice.paid":
        if (event.data.object?.subscription) {
          await processStripeSubscriptionObject({
            subscription: {
              id: event.data.object.subscription,
              status: "active",
            },
          });
        }
        break;
      case "invoice.payment_failed":
        if (event.data.object?.subscription) {
          await processStripeSubscriptionObject({
            subscription: {
              id: event.data.object.subscription,
              status: "past_due",
            },
          });
        }
        break;
      default:
        break;
    }

    res.status(200).json({
      success: true,
      message: "Stripe webhook processed successfully",
    });
  },
);
