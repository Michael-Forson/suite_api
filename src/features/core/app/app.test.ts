/// <reference types="jest" />
import request from "supertest";
import {
  AppStatus,
  OrganizationAppStatus,
} from "../../../generated/prisma/enums.js";
import { authHeader } from "../../../test-utils/auth.js";
import {
  createTestApp,
  createTestMember,
  createTestOrganization,
  createTestOrganizationApp,
  createTestUser,
} from "../../../test-utils/factories.js";
import { app, mockedSendTemplateEmail } from "../../../test-utils/testApp.js";
import {
  assertTestDatabaseReady,
  disconnectTestDatabase,
  truncateTestDatabase,
} from "../../../test-utils/testDb.js";

await assertTestDatabaseReady();

beforeEach(async () => {
  mockedSendTemplateEmail.mockClear();
  await truncateTestDatabase();
});

afterAll(async () => {
  await disconnectTestDatabase();
});

describe("app registry endpoints", () => {
  it("registers an app with frontend-provided key and rejects duplicates", async () => {
    const user = await createTestUser();

    const response = await request(app)
      .post("/user/api/v1/apps")
      .set("Authorization", authHeader(user.id))
      .send({
        name: "Point of Sale",
        key: "POS_APP",
        description: "Retail sales app",
      });

    expect(response.status).toBe(201);
    expect(response.body.data.app).toMatchObject({
      name: "Point of Sale",
      key: "POS_APP",
      description: "Retail sales app",
      status: AppStatus.ACTIVE,
    });
    expect(typeof response.body.data.app.id).toBe("string");

    const duplicateResponse = await request(app)
      .post("/user/api/v1/apps")
      .set("Authorization", authHeader(user.id))
      .send({ name: "Duplicate POS", key: "POS_APP" });

    expect(duplicateResponse.status).toBe(409);
  });

  it("lists active apps by default and can include disabled apps", async () => {
    const user = await createTestUser();
    await createTestApp({ name: "Inventory", key: "inventory" });
    await createTestApp({
      name: "Accounting",
      key: "accounting",
      status: AppStatus.DISABLED,
    });

    const activeResponse = await request(app)
      .get("/user/api/v1/apps")
      .set("Authorization", authHeader(user.id));

    expect(activeResponse.status).toBe(200);
    expect(activeResponse.body.data.apps.map((item: any) => item.key)).toEqual([
      "inventory",
    ]);

    const allResponse = await request(app)
      .get("/user/api/v1/apps?includeDisabled=true")
      .set("Authorization", authHeader(user.id));

    expect(allResponse.status).toBe(200);
    expect(allResponse.body.data.apps.map((item: any) => item.key).sort()).toEqual(
      ["accounting", "inventory"],
    );
  });

  it("gets and updates app details by key", async () => {
    const user = await createTestUser();
    await createTestApp({
      name: "Inventory",
      key: "inventory",
      description: "Old description",
    });

    const detailsResponse = await request(app)
      .get("/user/api/v1/apps/inventory")
      .set("Authorization", authHeader(user.id));

    expect(detailsResponse.status).toBe(200);
    expect(detailsResponse.body.data.app.key).toBe("inventory");

    const updateResponse = await request(app)
      .patch("/user/api/v1/apps/inventory/details")
      .set("Authorization", authHeader(user.id))
      .send({
        name: "Inventory Manager",
        description: null,
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.data.app).toMatchObject({
      name: "Inventory Manager",
      key: "inventory",
      description: null,
    });

    const keyUpdateResponse = await request(app)
      .patch("/user/api/v1/apps/inventory/details")
      .set("Authorization", authHeader(user.id))
      .send({ key: "inventory-manager" });

    expect(keyUpdateResponse.status).toBe(400);
    expect(keyUpdateResponse.body.message).toBe("App key cannot be updated");
  });

  it("activates or disables apps", async () => {
    const user = await createTestUser();
    await createTestApp({ name: "Accounting", key: "accounting" });

    const statusResponse = await request(app)
      .patch("/user/api/v1/apps/accounting/status")
      .set("Authorization", authHeader(user.id))
      .send({ status: AppStatus.DISABLED });

    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.data.app.status).toBe(AppStatus.DISABLED);
  });
});

describe("organization app access endpoints", () => {
  it("lists active organization apps for active members", async () => {
    const { organization, owner } = await createTestOrganization();
    const { user: member } = await createTestMember({
      organizationId: organization.id,
    });
    const inventory = await createTestApp({ name: "Inventory", key: "inventory" });
    const accounting = await createTestApp({
      name: "Accounting",
      key: "accounting",
    });
    const disabledRegistryApp = await createTestApp({
      name: "Disabled App",
      key: "disabled-app",
      status: AppStatus.DISABLED,
    });

    await createTestOrganizationApp({
      organizationId: organization.id,
      app: inventory,
      enabledBy: owner.id,
    });
    await createTestOrganizationApp({
      organizationId: organization.id,
      app: accounting,
      enabledBy: owner.id,
      status: OrganizationAppStatus.DISABLED,
    });
    await createTestOrganizationApp({
      organizationId: organization.id,
      app: disabledRegistryApp,
      enabledBy: owner.id,
    });

    const listResponse = await request(app)
      .get(`/user/api/v1/organizations/${organization.id}/apps`)
      .set("Authorization", authHeader(member.id));

    expect(listResponse.status).toBe(200);
    expect(
      listResponse.body.data.organizationApps.map((item: any) => item.app.key),
    ).toEqual(["inventory"]);
  });

  it("blocks outsiders from listing organization apps", async () => {
    const { organization } = await createTestOrganization();
    const outsider = await createTestUser();

    const response = await request(app)
      .get(`/user/api/v1/organizations/${organization.id}/apps`)
      .set("Authorization", authHeader(outsider.id));

    expect(response.status).toBe(403);
  });
});
