/// <reference types="jest" />
import { jest } from "@jest/globals";
import request from "supertest";
import {
  AppStatus,
  BillingInterval,
  BillingProvider,
  SubscriptionStatus,
} from "../../../generated/prisma/enums.js";
import { prisma } from "../../../prisma.js";
import { authHeader, superAdminAuthHeader } from "../../../test-utils/auth.js";
import {
  createTestApp,
  createTestOrganization,
  createTestSuperAdmin,
  createTestSubscriptionPlan,
  createTestSubscriptionPlanPrice,
  createTestUser,
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
});

afterAll(async () => {
  await disconnectTestDatabase();
});

describe("super-admin subscription plan management", () => {
  it("requires super-admin authentication", async () => {
    const user = await createTestUser();

    const missingAuthResponse = await request(app)
      .post("/super-admin/api/v1/subscriptions/plans")
      .send({ name: "Starter" });
    expect(missingAuthResponse.status).toBe(401);

    const userTokenResponse = await request(app)
      .post("/super-admin/api/v1/subscriptions/plans")
      .set("Authorization", authHeader(user.id))
      .send({ name: "Starter" });
    expect(userTokenResponse.status).toBe(401);
  });

  it("creates, lists, gets, updates, and deactivates subscription plans", async () => {
    const superAdmin = await createTestSuperAdmin();

    const createResponse = await request(app)
      .post("/super-admin/api/v1/subscriptions/plans")
      .set("Authorization", superAdminAuthHeader(superAdmin.id))
      .send({
        name: "Starter",
        description: "For small teams",
        sortOrder: 10,
      });
    expect(createResponse.status).toBe(201);
    expect(createResponse.body.data.plan).toMatchObject({
      name: "Starter",
      description: "For small teams",
      sortOrder: 10,
      isActive: true,
    });
    const planId = createResponse.body.data.plan.id;

    const listResponse = await request(app)
      .get("/super-admin/api/v1/subscriptions/plans")
      .set("Authorization", superAdminAuthHeader(superAdmin.id));
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data.plans).toHaveLength(1);

    const getResponse = await request(app)
      .get(`/super-admin/api/v1/subscriptions/plans/${planId}`)
      .set("Authorization", superAdminAuthHeader(superAdmin.id));
    expect(getResponse.status).toBe(200);
    expect(getResponse.body.data.plan.id).toBe(planId);

    const updateResponse = await request(app)
      .patch(`/super-admin/api/v1/subscriptions/plans/${planId}/details`)
      .set("Authorization", superAdminAuthHeader(superAdmin.id))
      .send({ name: "Starter Plan", description: null, sortOrder: 5 });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.data.plan).toMatchObject({
      name: "Starter Plan",
      description: null,
      sortOrder: 5,
    });

    const statusResponse = await request(app)
      .patch(`/super-admin/api/v1/subscriptions/plans/${planId}/status`)
      .set("Authorization", superAdminAuthHeader(superAdmin.id))
      .send({ isActive: false });
    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.data.plan.isActive).toBe(false);
  });

  it("adds and removes included apps idempotently", async () => {
    const superAdmin = await createTestSuperAdmin();
    const plan = await createTestSubscriptionPlan({ name: "Starter" });
    await createTestApp({
      key: "invoicing",
      name: "Invoicing",
      status: AppStatus.ACTIVE,
    });

    const firstAdd = await request(app)
      .post(`/super-admin/api/v1/subscriptions/plans/${plan.id}/apps`)
      .set("Authorization", superAdminAuthHeader(superAdmin.id))
      .send({ appKey: "invoicing" });
    expect(firstAdd.status).toBe(200);
    expect(firstAdd.body.data.plan.includedApps.map((item: any) => item.key)).toEqual([
      "invoicing",
    ]);

    const secondAdd = await request(app)
      .post(`/super-admin/api/v1/subscriptions/plans/${plan.id}/apps`)
      .set("Authorization", superAdminAuthHeader(superAdmin.id))
      .send({ appKey: "invoicing" });
    expect(secondAdd.status).toBe(200);
    expect(secondAdd.body.data.plan.includedApps).toHaveLength(1);

    const removeResponse = await request(app)
      .delete(`/super-admin/api/v1/subscriptions/plans/${plan.id}/apps/invoicing`)
      .set("Authorization", superAdminAuthHeader(superAdmin.id));
    expect(removeResponse.status).toBe(200);
    expect(removeResponse.body.data.plan.includedApps).toHaveLength(0);

    const unknownAppResponse = await request(app)
      .post(`/super-admin/api/v1/subscriptions/plans/${plan.id}/apps`)
      .set("Authorization", superAdminAuthHeader(superAdmin.id))
      .send({ appKey: "unknown" });
    expect(unknownAppResponse.status).toBe(404);
  });

  it("upserts and deactivates Stripe plan prices", async () => {
    const superAdmin = await createTestSuperAdmin();
    const plan = await createTestSubscriptionPlan({ name: "Starter" });

    const createPriceResponse = await request(app)
      .put(`/super-admin/api/v1/subscriptions/plans/${plan.id}/prices`)
      .set("Authorization", superAdminAuthHeader(superAdmin.id))
      .send({
        interval: "month",
        providerPriceId: "price_starter_month",
        amount: 29,
        currency: "usd",
      });
    expect(createPriceResponse.status).toBe(200);
    expect(createPriceResponse.body.data.plan.prices[0]).toMatchObject({
      provider: BillingProvider.STRIPE,
      billingInterval: BillingInterval.MONTH,
      providerPriceId: "price_starter_month",
      amount: 29,
      currency: "USD",
      isActive: true,
    });

    const updatePriceResponse = await request(app)
      .put(`/super-admin/api/v1/subscriptions/plans/${plan.id}/prices`)
      .set("Authorization", superAdminAuthHeader(superAdmin.id))
      .send({
        interval: "month",
        providerPriceId: "price_starter_month_v2",
        amount: 35,
        currency: "USD",
      });
    expect(updatePriceResponse.status).toBe(200);
    expect(updatePriceResponse.body.data.plan.prices[0]).toMatchObject({
      providerPriceId: "price_starter_month_v2",
      amount: 35,
    });

    const statusResponse = await request(app)
      .patch(`/super-admin/api/v1/subscriptions/plans/${plan.id}/prices/month/status`)
      .set("Authorization", superAdminAuthHeader(superAdmin.id))
      .send({ isActive: false });
    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.data.plan.prices[0].isActive).toBe(false);
  });

  it("deletes a plan and cascades its apps and prices", async () => {
    const superAdmin = await createTestSuperAdmin();
    const invoicing = await createTestApp({
      key: "invoicing",
      name: "Invoicing",
      status: AppStatus.ACTIVE,
    });
    const plan = await createTestSubscriptionPlan({
      name: "Starter",
      includedAppIds: [invoicing.id],
    });
    await createTestSubscriptionPlanPrice({
      planId: plan.id,
      providerPriceId: "price_starter_month",
    });

    const response = await request(app)
      .delete(`/super-admin/api/v1/subscriptions/plans/${plan.id}`)
      .set("Authorization", superAdminAuthHeader(superAdmin.id));
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(await prisma.subscriptionPlan.count()).toBe(0);
    expect(await prisma.subscriptionPlanApp.count()).toBe(0);
    expect(await prisma.subscriptionPlanPrice.count()).toBe(0);
    // The app itself is a separate registry entry — only its membership went.
    expect(await prisma.app.count({ where: { id: invoicing.id } })).toBe(1);
  });

  it("rejects deleting a plan an organisation is subscribed to", async () => {
    const superAdmin = await createTestSuperAdmin();
    const { organization } = await createTestOrganization();
    const plan = await createTestSubscriptionPlan({ name: "Starter" });
    await prisma.organizationSubscription.create({
      data: {
        organizationId: organization.id,
        planId: plan.id,
        provider: BillingProvider.STRIPE,
        billingInterval: BillingInterval.MONTH,
        status: SubscriptionStatus.ACTIVE,
      },
    });

    const response = await request(app)
      .delete(`/super-admin/api/v1/subscriptions/plans/${plan.id}`)
      .set("Authorization", superAdminAuthHeader(superAdmin.id));
    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/Deactivate it instead/);
    expect(await prisma.subscriptionPlan.count()).toBe(1);
  });

  it("rejects deleting an unknown or malformed plan id", async () => {
    const superAdmin = await createTestSuperAdmin();

    const unknownResponse = await request(app)
      .delete(
        "/super-admin/api/v1/subscriptions/plans/11111111-1111-4111-8111-111111111111",
      )
      .set("Authorization", superAdminAuthHeader(superAdmin.id));
    expect(unknownResponse.status).toBe(404);

    const malformedResponse = await request(app)
      .delete("/super-admin/api/v1/subscriptions/plans/not-a-uuid")
      .set("Authorization", superAdminAuthHeader(superAdmin.id));
    expect(malformedResponse.status).toBe(400);

    const unauthenticatedResponse = await request(app).delete(
      "/super-admin/api/v1/subscriptions/plans/not-a-uuid",
    );
    expect(unauthenticatedResponse.status).toBe(401);
  });

  it("customer listing and checkout reflect admin-managed plans and prices", async () => {
    const superAdmin = await createTestSuperAdmin();
    const { organization, owner } = await createTestOrganization();
    const invoicing = await createTestApp({
      key: "invoicing",
      name: "Invoicing",
      status: AppStatus.ACTIVE,
    });

    await request(app)
      .post("/super-admin/api/v1/subscriptions/plans")
      .set("Authorization", superAdminAuthHeader(superAdmin.id))
      .send({ name: "Starter", sortOrder: 10 });
    const starterPlan = await prisma.subscriptionPlan.findFirstOrThrow({
      where: { name: "Starter" },
      select: { id: true },
    });
    await request(app)
      .post(`/super-admin/api/v1/subscriptions/plans/${starterPlan.id}/apps`)
      .set("Authorization", superAdminAuthHeader(superAdmin.id))
      .send({ appKey: invoicing.key });
    await request(app)
      .put(`/super-admin/api/v1/subscriptions/plans/${starterPlan.id}/prices`)
      .set("Authorization", superAdminAuthHeader(superAdmin.id))
      .send({
        interval: "month",
        providerPriceId: "price_starter_month",
        amount: 29,
        currency: "USD",
      });

    const customerPlansResponse = await request(app)
      .get(`/user/api/v1/organizations/${organization.id}/subscriptions/plans`)
      .query({ interval: "month" })
      .set("Authorization", authHeader(owner.id));
    expect(customerPlansResponse.status).toBe(200);
    expect(customerPlansResponse.body.data.plans[0]).toMatchObject({
      id: starterPlan.id,
      name: "Starter",
      checkoutReady: true,
      price: { providerPriceId: "price_starter_month" },
    });

    const checkoutResponse = await request(app)
      .post(
        `/user/api/v1/organizations/${organization.id}/subscriptions/checkout`,
      )
      .set("Authorization", authHeader(owner.id))
      .send({ planId: starterPlan.id, interval: "month" });
    expect(checkoutResponse.status).toBe(200);
    expect(mockedCreateCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ priceId: "price_starter_month" }),
    );
  });

  it("blocks customer checkout for inactive plans and inactive prices", async () => {
    const { organization, owner } = await createTestOrganization();
    const inactivePlan = await createTestSubscriptionPlan({
      name: "Starter",
      isActive: false,
    });
    const activePlan = await createTestSubscriptionPlan({
      name: "Growth",
    });
    await createTestSubscriptionPlanPrice({
      planId: inactivePlan.id,
      providerPriceId: "price_starter_month",
    });
    await createTestSubscriptionPlanPrice({
      planId: activePlan.id,
      providerPriceId: "price_growth_month",
      isActive: false,
    });

    const inactivePlanCheckout = await request(app)
      .post(
        `/user/api/v1/organizations/${organization.id}/subscriptions/checkout`,
      )
      .set("Authorization", authHeader(owner.id))
      .send({ planId: inactivePlan.id, interval: "month" });
    expect(inactivePlanCheckout.status).toBe(404);

    const inactivePriceCheckout = await request(app)
      .post(
        `/user/api/v1/organizations/${organization.id}/subscriptions/checkout`,
      )
      .set("Authorization", authHeader(owner.id))
      .send({ planId: activePlan.id, interval: "month" });
    expect(inactivePriceCheckout.status).toBe(409);
    expect(inactivePriceCheckout.body.code).toBe("PLAN_PRICE_NOT_CONFIGURED");
  });
});
