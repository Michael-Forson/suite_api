/// <reference types="jest" />
import { jest } from "@jest/globals";
import request from "supertest";
import {
  BillingInterval,
  BillingProvider,
  OrganizationAppAccessType,
  OrganizationAppStatus,
} from "../../../generated/prisma/enums.js";
import { prisma } from "../../../prisma.js";
import { authHeader } from "../../../test-utils/auth.js";
import {
  createTestApp,
  createTestMember,
  createTestOrganization,
  createTestOrganizationApp,
  createTestSubscriptionPlan,
  createTestSubscriptionPlanPrice,
} from "../../../test-utils/factories.js";
import {
  assertTestDatabaseReady,
  disconnectTestDatabase,
  truncateTestDatabase,
} from "../../../test-utils/testDb.js";

const mockedCreateCustomer = jest.fn<(input: any) => Promise<any>>();
const mockedCreateCheckoutSession = jest.fn<(input: any) => Promise<any>>();
const mockedVerifyWebhookSignature = jest.fn<
  (payload: string, signature: string) => boolean
>();
const mockedParseWebhookEvent = jest.fn<(payload: any) => any>();
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

(jest as any).unstable_mockModule(
  "../../../services/stripe/stripe.service.js",
  () => ({
    stripeService: {
      createCustomer: mockedCreateCustomer,
      createCheckoutSession: mockedCreateCheckoutSession,
      verifyWebhookSignature: mockedVerifyWebhookSignature,
      parseWebhookEvent: mockedParseWebhookEvent,
    },
  }),
);

(jest as any).unstable_mockModule(
  "../../../services/paystack/paystack.service.js",
  () => ({
    paystackService: {
      initializeTransaction: jest.fn(),
      verifyTransaction: jest.fn(),
      verifyWebhookSignature: jest.fn(),
      parseWebhookEvent: jest.fn(),
      isSuccessfulPayment: jest.fn(),
      isFailedPayment: jest.fn(),
    },
  }),
);

const { app } = await import("../../../test-utils/testApp.js");

await assertTestDatabaseReady();

beforeEach(async () => {
  await truncateTestDatabase();
  mockedCreateCustomer.mockReset();
  mockedCreateCheckoutSession.mockReset();
  mockedVerifyWebhookSignature.mockReset();
  mockedParseWebhookEvent.mockReset();
  mockedCreateCustomer.mockResolvedValue({ id: "cus_test" });
  mockedCreateCheckoutSession.mockResolvedValue({
    id: "cs_test",
    url: "https://checkout.stripe.test/session",
    customer: "cus_test",
    subscription: null,
    status: "open",
  });
  mockedVerifyWebhookSignature.mockReturnValue(true);
  mockedParseWebhookEvent.mockImplementation((payload: any) => payload);
});

afterAll(async () => {
  await disconnectTestDatabase();
});

async function createCatalog() {
  const invoicing = await createTestApp({
    key: "invoicing",
    name: "Invoicing",
  });
  const inventory = await createTestApp({
    key: "inventory",
    name: "Inventory",
  });

  const starter = await createTestSubscriptionPlan({
    name: "Starter",
    sortOrder: 10,
    includedAppIds: [invoicing.id],
  });
  const growth = await createTestSubscriptionPlan({
    name: "Growth",
    sortOrder: 20,
    includedAppIds: [invoicing.id, inventory.id],
  });

  await createTestSubscriptionPlanPrice({
    planId: starter.id,
    provider: BillingProvider.STRIPE,
    billingInterval: BillingInterval.MONTH,
    currency: "USD",
    providerPriceId: "price_starter_month",
    amount: 29,
  });
  await createTestSubscriptionPlanPrice({
    planId: growth.id,
    provider: BillingProvider.STRIPE,
    billingInterval: BillingInterval.MONTH,
    currency: "USD",
    providerPriceId: "price_growth_month",
    amount: 79,
  });

  return { invoicing, inventory, starter, growth };
}

describe("stripe plan subscriptions", () => {
  it("lists active plans with included apps and checkout readiness", async () => {
    const { organization, owner } = await createTestOrganization();
    const { starter, growth } = await createCatalog();

    const response = await request(app)
      .get(`/user/api/v1/organizations/${organization.id}/subscriptions/plans`)
      .query({ interval: "month" })
      .set("Authorization", authHeader(owner.id));

    expect(response.status).toBe(200);
    expect(response.body.data.pricing).toMatchObject({
      provider: BillingProvider.STRIPE,
      billingInterval: BillingInterval.MONTH,
      checkoutProviderReady: true,
    });
    expect(response.body.data.plans.map((plan: any) => plan.id)).toEqual([
      starter.id,
      growth.id,
    ]);
    expect(response.body.data.plans[0]).toMatchObject({
      id: starter.id,
      name: "Starter",
      checkoutReady: true,
      price: {
        provider: BillingProvider.STRIPE,
        providerPriceId: "price_starter_month",
      },
    });
    expect(response.body.data.plans[0].includedApps).toHaveLength(1);
  });

  it("creates Stripe checkout for a selected plan", async () => {
    const { organization, owner } = await createTestOrganization();
    const { starter } = await createCatalog();

    const response = await request(app)
      .post(
        `/user/api/v1/organizations/${organization.id}/subscriptions/checkout`,
      )
      .set("Authorization", authHeader(owner.id))
      .send({ planId: starter.id, interval: "month" });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      checkoutUrl: "https://checkout.stripe.test/session",
      provider: BillingProvider.STRIPE,
    });
    expect(mockedCreateCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "cus_test",
        priceId: "price_starter_month",
        metadata: expect.objectContaining({
          organizationId: expect.stringMatching(UUID_REGEX),
          subscriptionId: expect.stringMatching(UUID_REGEX),
        }),
      }),
    );

    const subscription = await prisma.organizationSubscription.findUnique({
      where: { organizationId: organization.id },
    });
    expect(subscription?.status).toBe("PENDING");
  });

  it("requires owner or admin access for checkout", async () => {
    const { organization } = await createTestOrganization();
    const { user: member } = await createTestMember({
      organizationId: organization.id,
    });
    const { starter } = await createCatalog();

    const response = await request(app)
      .post(
        `/user/api/v1/organizations/${organization.id}/subscriptions/checkout`,
      )
      .set("Authorization", authHeader(member.id))
      .send({ planId: starter.id, interval: "month" });

    expect(response.status).toBe(403);
  });

  it("rejects checkout when the plan has no active Stripe price", async () => {
    const { organization, owner } = await createTestOrganization();
    const { starter } = await createCatalog();
    await prisma.subscriptionPlanPrice.deleteMany({
      where: { planId: starter.id },
    });

    const response = await request(app)
      .post(
        `/user/api/v1/organizations/${organization.id}/subscriptions/checkout`,
      )
      .set("Authorization", authHeader(owner.id))
      .send({ planId: starter.id, interval: "month" });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("PLAN_PRICE_NOT_CONFIGURED");
    expect(mockedCreateCheckoutSession).not.toHaveBeenCalled();
  });

  it("activates and suspends paid plan app access from Stripe webhooks", async () => {
    const { organization, owner } = await createTestOrganization();
    const { invoicing, inventory, growth } = await createCatalog();

    await request(app)
      .post(
        `/user/api/v1/organizations/${organization.id}/subscriptions/checkout`,
      )
      .set("Authorization", authHeader(owner.id))
      .send({ planId: growth.id, interval: "month" });

    const completedResponse = await request(app)
      .post("/user/api/v1/subscriptions/stripe/webhook")
      .set("stripe-signature", "t=123,v1=test")
      .send({
        id: "evt_checkout",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_test",
            customer: "cus_test",
            subscription: "sub_test",
            payment_status: "paid",
          },
        },
      });

    expect(completedResponse.status).toBe(200);
    const activeApps = await prisma.organizationApp.findMany({
      where: { organizationId: organization.id },
      orderBy: { appId: "asc" },
    });
    expect(activeApps.map((item) => item.appId.toString()).sort()).toEqual(
      [invoicing.id.toString(), inventory.id.toString()].sort(),
    );
    expect(activeApps.every((item) => item.status === OrganizationAppStatus.ACTIVE)).toBe(
      true,
    );
    expect(
      activeApps.every(
        (item) => item.accessType === OrganizationAppAccessType.PAID,
      ),
    ).toBe(true);

    const failedResponse = await request(app)
      .post("/user/api/v1/subscriptions/stripe/webhook")
      .set("stripe-signature", "t=123,v1=test")
      .send({
        id: "evt_failed",
        type: "invoice.payment_failed",
        data: {
          object: {
            subscription: "sub_test",
          },
        },
      });

    expect(failedResponse.status).toBe(200);
    const suspendedApps = await prisma.organizationApp.findMany({
      where: { organizationId: organization.id },
    });
    expect(
      suspendedApps.every(
        (item) => item.status === OrganizationAppStatus.SUSPENDED,
      ),
    ).toBe(true);
  });

  it("does not suspend existing free app access", async () => {
    const { organization, owner } = await createTestOrganization();
    const { invoicing, inventory, growth } = await createCatalog();
    await createTestOrganizationApp({
      organizationId: organization.id,
      app: inventory,
      accessType: OrganizationAppAccessType.FREE,
    });

    await request(app)
      .post(
        `/user/api/v1/organizations/${organization.id}/subscriptions/checkout`,
      )
      .set("Authorization", authHeader(owner.id))
      .send({ planId: growth.id, interval: "month" });

    await request(app)
      .post("/user/api/v1/subscriptions/stripe/webhook")
      .set("stripe-signature", "t=123,v1=test")
      .send({
        id: "evt_checkout",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_test",
            customer: "cus_test",
            subscription: "sub_test",
            payment_status: "paid",
          },
        },
      });

    await request(app)
      .post("/user/api/v1/subscriptions/stripe/webhook")
      .set("stripe-signature", "t=123,v1=test")
      .send({
        id: "evt_failed",
        type: "invoice.payment_failed",
        data: {
          object: {
            subscription: "sub_test",
          },
        },
      });

    const invoicingAccess = await prisma.organizationApp.findUnique({
      where: {
        organizationId_appId: {
          organizationId: organization.id,
          appId: invoicing.id,
        },
      },
    });
    const inventoryAccess = await prisma.organizationApp.findUnique({
      where: {
        organizationId_appId: {
          organizationId: organization.id,
          appId: inventory.id,
        },
      },
    });

    expect(invoicingAccess?.status).toBe(OrganizationAppStatus.SUSPENDED);
    expect(inventoryAccess?.status).toBe(OrganizationAppStatus.ACTIVE);
    expect(inventoryAccess?.accessType).toBe(OrganizationAppAccessType.FREE);
  });
});
