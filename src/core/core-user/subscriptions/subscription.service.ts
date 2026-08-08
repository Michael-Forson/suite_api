import {
  AppStatus,
  BillingInterval,
  BillingProvider,
  OrganizationAppAccessType,
  OrganizationAppStatus,
  SubscriptionStatus,
} from "../../generated/prisma/enums.js";
import { prisma } from "../../prisma.js";
import { stripeService } from "../../services/stripe/stripe.service.js";
import { StripeSubscriptionObject } from "../../services/stripe/stripe.types.js";
import { getCustomerPaymentEmail } from "../../utils/paymentEmail.js";
import { parseId } from "../../../utils/parseId.js";
import { publicUrl } from "../../../utils/s3.js";
import {
  normalizeStripeSubscriptionStatus,
  subscriptionHasAccess,
} from "./subscription.helpers.js";

interface ServiceError extends Error {
  status?: number;
  code?: string;
  details?: Record<string, unknown>;
}

const serviceError = (
  status: number,
  message: string,
  code?: string,
  details?: Record<string, unknown>,
) => {
  const error = new Error(message) as ServiceError;
  error.status = status;
  error.code = code;
  error.details = details;
  return error;
};

const serializeId = (value: string | null | undefined) => value ?? null;

const serializeMoney = (amount: unknown) =>
  amount === null || amount === undefined ? null : Number(amount);

const serializePrice = (price: any | null) =>
  price
    ? {
        id: price.id.toString(),
        provider: price.provider,
        billingInterval: price.billingInterval,
        amount: serializeMoney(price.amount),
        currency: price.currency,
        providerPriceId: price.providerPriceId,
      }
    : null;

const serializeApp = (app: any) => ({
  id: app.id.toString(),
  key: app.key,
  name: app.name,
  description: app.description,
  iconUrl: publicUrl(app.iconKey),
});

type CheckoutSnapshot = {
  planId: string;
  provider: BillingProvider;
  billingInterval: BillingInterval;
  includedAppIds: string[];
  price: ReturnType<typeof serializePrice>;
};

const createCheckoutSnapshot = ({
  plan,
  billingInterval,
  includedAppIds,
  price,
}: {
  plan: { id: string };
  billingInterval: BillingInterval;
  includedAppIds: string[];
  price: any;
}): CheckoutSnapshot => ({
  planId: serializeId(plan.id) || "",
  provider: BillingProvider.STRIPE,
  billingInterval,
  includedAppIds: includedAppIds.map((appId) => appId.toString()),
  price: serializePrice(price),
});

const getCheckoutUrls = () => ({
  successUrl:
    process.env.STRIPE_SUBSCRIPTION_SUCCESS_URL ||
    "http://localhost:3000/payment/callback?session_id={CHECKOUT_SESSION_ID}",
  cancelUrl:
    process.env.STRIPE_SUBSCRIPTION_CANCEL_URL ||
    "http://localhost:3000/payment/callback?subscription=cancelled",
});

const dateFromStripeUnix = (value?: number | null) =>
  value ? new Date(value * 1000) : null;

export const listSubscriptionPlansForOrganization = async ({
  organizationId,
  interval,
}: {
  organizationId: string;
  interval: BillingInterval;
}) => {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true },
  });
  if (!organization) throw serviceError(404, "Organization not found");

  const plans = await prisma.subscriptionPlan.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      includedApps: {
        where: { app: { status: AppStatus.ACTIVE } },
        include: { app: true },
        orderBy: { app: { name: "asc" } },
      },
      prices: {
        where: {
          provider: BillingProvider.STRIPE,
          billingInterval: interval,
          isActive: true,
        },
        take: 1,
      },
    },
  });

  const serializedPlans = plans.map((plan) => {
    const price = serializePrice(plan.prices[0] ?? null);
    return {
      id: plan.id.toString(),
      name: plan.name,
      description: plan.description,
      checkoutReady: Boolean(price),
      checkoutUnavailableReason: price ? null : "PLAN_PRICE_NOT_CONFIGURED",
      price,
      includedApps: plan.includedApps.map(({ app }) => serializeApp(app)),
    };
  });

  return {
    pricing: {
      provider: BillingProvider.STRIPE,
      billingInterval: interval,
      checkoutProviderReady: serializedPlans.some((plan) => plan.checkoutReady),
    },
    plans: serializedPlans,
  };
};

const ensureStripeCustomer = async ({
  organizationId,
  organizationName,
  ownerEmail,
}: {
  organizationId: string;
  organizationName: string;
  ownerEmail?: string | null;
}) => {
  const existing = await prisma.organizationBillingCustomer.findUnique({
    where: {
      organizationId_provider: {
        organizationId,
        provider: BillingProvider.STRIPE,
      },
    },
  });
  if (existing) return existing.providerCustomerId;

  const customer = await stripeService.createCustomer({
    email: getCustomerPaymentEmail(ownerEmail),
    name: organizationName,
    metadata: { organizationId: organizationId.toString() },
  });

  const saved = await prisma.organizationBillingCustomer.create({
    data: {
      organizationId,
      provider: BillingProvider.STRIPE,
      providerCustomerId: customer.id,
      metadata: customer as any,
    },
  });

  return saved.providerCustomerId;
};

export const createSubscriptionCheckout = async ({
  organizationId,
  userId,
  planId,
  interval,
}: {
  organizationId: string;
  userId: string;
  planId: string;
  interval: BillingInterval;
}) => {
  const existingActive = await prisma.organizationSubscription.findFirst({
    where: {
      organizationId,
      status: SubscriptionStatus.ACTIVE,
    },
    select: { id: true },
  });
  if (existingActive) {
    throw serviceError(
      409,
      "This organization already has an active subscription.",
      "ACTIVE_SUBSCRIPTION_EXISTS",
    );
  }

  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id: planId },
    include: {
      includedApps: {
        where: { app: { status: AppStatus.ACTIVE } },
        include: { app: true },
      },
      prices: {
        where: {
          provider: BillingProvider.STRIPE,
          billingInterval: interval,
          isActive: true,
        },
        take: 1,
      },
    },
  });
  if (!plan || !plan.isActive) {
    throw serviceError(404, "Active subscription plan not found");
  }

  const price = plan.prices[0] ?? null;
  if (!price) {
    throw serviceError(
      409,
      "The selected plan does not have an active Stripe price for this interval.",
      "PLAN_PRICE_NOT_CONFIGURED",
    );
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      owner: { select: { email: true } },
    },
  });
  if (!organization) throw serviceError(404, "Organization not found");

  const providerCustomerId = await ensureStripeCustomer({
    organizationId,
    organizationName: organization.name,
    ownerEmail: organization.owner.email,
  });
  const includedAppIds = plan.includedApps.map((included) => included.appId);
  const checkoutSnapshot = createCheckoutSnapshot({
    plan,
    billingInterval: interval,
    includedAppIds,
    price,
  });

  const subscription = await prisma.organizationSubscription.upsert({
    where: { organizationId },
    create: {
      organizationId,
      planId: plan.id,
      provider: BillingProvider.STRIPE,
      billingInterval: interval,
      status: SubscriptionStatus.PENDING,
      providerCustomerId,
    },
    update: {
      planId: plan.id,
      provider: BillingProvider.STRIPE,
      billingInterval: interval,
      status: SubscriptionStatus.PENDING,
      providerCustomerId,
      providerSubscriptionId: null,
      currentPeriodEnd: null,
      providerResponse: undefined,
    },
  });

  const { successUrl, cancelUrl } = getCheckoutUrls();
  const session = await stripeService.createCheckoutSession({
    customerId: providerCustomerId,
    priceId: price.providerPriceId,
    successUrl,
    cancelUrl,
    metadata: {
      organizationId: organizationId.toString(),
      subscriptionId: subscription.id.toString(),
      planId: plan.id.toString(),
      billingInterval: interval,
    },
  });

  const checkoutSession = await prisma.subscriptionCheckoutSession.create({
    data: {
      organizationId,
      subscriptionId: subscription.id,
      provider: BillingProvider.STRIPE,
      providerSessionId: session.id,
      checkoutUrl: session.url || "",
      checkoutSnapshot: checkoutSnapshot as any,
      providerResponse: session as any,
      createdBy: userId,
    },
  });

  return {
    checkoutUrl: checkoutSession.checkoutUrl,
    checkoutSessionId: checkoutSession.id.toString(),
    providerSessionId: checkoutSession.providerSessionId,
    subscriptionId: subscription.id.toString(),
    provider: BillingProvider.STRIPE,
  };
};

export const serializeCurrentSubscription = async (organizationId: string) => {
  const subscription = await prisma.organizationSubscription.findUnique({
    where: { organizationId },
    include: {
      plan: {
        include: {
          includedApps: {
            where: { app: { status: AppStatus.ACTIVE } },
            include: { app: true },
            orderBy: { app: { name: "asc" } },
          },
        },
      },
    },
  });

  if (!subscription) return null;

  return {
    id: subscription.id.toString(),
    organizationId: subscription.organizationId.toString(),
    provider: subscription.provider,
    status: subscription.status,
    hasAccess: subscriptionHasAccess(subscription.status),
    billingInterval: subscription.billingInterval,
    providerCustomerId: subscription.providerCustomerId,
    providerSubscriptionId: subscription.providerSubscriptionId,
    currentPeriodEnd: subscription.currentPeriodEnd,
    plan: {
      id: subscription.plan.id.toString(),
      name: subscription.plan.name,
      description: subscription.plan.description,
    },
    includedApps: subscription.plan.includedApps.map(({ app }) =>
      serializeApp(app),
    ),
  };
};

export const applySubscriptionAccess = async (
  subscriptionId: string,
  status: SubscriptionStatus,
) => {
  const subscription = await prisma.organizationSubscription.findUnique({
    where: { id: subscriptionId },
    include: {
      plan: {
        include: {
          includedApps: {
            where: { app: { status: AppStatus.ACTIVE } },
            select: { appId: true },
          },
        },
      },
    },
  });
  if (!subscription) return;

  const appIds = subscription.plan.includedApps.map(
    (included) => included.appId,
  );
  if (!appIds.length) return;

  if (subscriptionHasAccess(status)) {
    const existingApps = await prisma.organizationApp.findMany({
      where: {
        organizationId: subscription.organizationId,
        appId: { in: appIds },
      },
      select: { appId: true, accessType: true },
    });
    const existingByAppId = new Map(
      existingApps.map((app) => [app.appId.toString(), app]),
    );
    const operations = appIds
      .map((appId) => {
        const existing = existingByAppId.get(appId.toString());
        if (!existing) {
          return prisma.organizationApp.create({
            data: {
              organizationId: subscription.organizationId,
              appId,
              status: OrganizationAppStatus.ACTIVE,
              accessType: OrganizationAppAccessType.PAID,
            },
          });
        }
        if (existing.accessType !== OrganizationAppAccessType.PAID) {
          return null;
        }

        return prisma.organizationApp.update({
          where: {
            organizationId_appId: {
              organizationId: subscription.organizationId,
              appId,
            },
          },
          data: {
            status: OrganizationAppStatus.ACTIVE,
            disabledAt: null,
            disabledBy: null,
          },
        });
      })
      .filter(Boolean);

    if (operations.length) {
      await prisma.$transaction(operations as any);
    }
    return;
  }

  await prisma.organizationApp.updateMany({
    where: {
      organizationId: subscription.organizationId,
      appId: { in: appIds },
      accessType: OrganizationAppAccessType.PAID,
    },
    data: {
      status: OrganizationAppStatus.SUSPENDED,
      disabledAt: new Date(),
    },
  });
};

const uuidFromValue = (value: unknown) =>
  typeof value === "string" ? parseId(value) : null;

export const processStripeCheckoutCompleted = async (session: any) => {
  const providerSessionId = String(session.id || "");
  const providerSubscriptionId =
    typeof session.subscription === "string" ? session.subscription : null;
  const providerCustomerId =
    typeof session.customer === "string" ? session.customer : null;
  const metadata = session.metadata || {};

  const checkoutSession = providerSessionId
    ? await prisma.subscriptionCheckoutSession.findUnique({
        where: { providerSessionId },
      })
    : null;
  const subscriptionId = checkoutSession?.subscriptionId
    ? checkoutSession.subscriptionId
    : uuidFromValue(metadata.subscriptionId);
  if (!subscriptionId) return;

  const nextStatus =
    session.payment_status === "paid"
      ? SubscriptionStatus.ACTIVE
      : SubscriptionStatus.PENDING;

  await prisma.$transaction(async (tx) => {
    await tx.organizationSubscription.update({
      where: { id: subscriptionId },
      data: {
        status: nextStatus,
        providerSubscriptionId,
        providerCustomerId,
        providerResponse: session as any,
      },
    });

    if (checkoutSession) {
      await tx.subscriptionCheckoutSession.update({
        where: { id: checkoutSession.id },
        data: {
          status: "COMPLETED",
          providerResponse: session as any,
        },
      });
    }
  });

  await applySubscriptionAccess(subscriptionId, nextStatus);
};

export const processStripeSubscriptionObject = async ({
  subscription,
  fallbackStatus,
}: {
  subscription: StripeSubscriptionObject;
  fallbackStatus?: SubscriptionStatus;
}) => {
  const providerSubscriptionId = subscription.id;
  if (!providerSubscriptionId) return;

  const saved = await prisma.organizationSubscription.findUnique({
    where: { providerSubscriptionId },
    select: { id: true },
  });
  if (!saved) return;

  const nextStatus =
    fallbackStatus ?? normalizeStripeSubscriptionStatus(subscription.status);
  const data: Record<string, any> = {
    status: nextStatus,
    providerResponse: subscription as any,
  };
  const currentPeriodEnd = dateFromStripeUnix(
    subscription.current_period_end ??
      (subscription as any).items?.data?.[0]?.current_period_end,
  );
  if (currentPeriodEnd) data.currentPeriodEnd = currentPeriodEnd;

  await prisma.organizationSubscription.update({
    where: { id: saved.id },
    data,
  });

  await applySubscriptionAccess(saved.id, nextStatus);
};

export const serializeServiceError = (error: any) => ({
  status: error.status || 500,
  body: {
    success: false,
    message: error.message || "Subscription request failed",
    ...(error.code && { code: error.code }),
    ...(error.details && { details: error.details }),
  },
});
