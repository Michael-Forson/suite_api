/// <reference types="jest" />
import request from "supertest";
import {
  AppStatus,
  OrganizationAppStatus,
} from "../../../generated/prisma/enums.js";
import {
  superAdminAuthHeader,
  authHeader,
} from "../../../test-utils/auth.js";
import {
  createTestSuperAdmin,
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
  it("prevents business users from managing the app registry", async () => {
    const user = await createTestUser();

    const registerResponse = await request(app)
      .post("/user/api/v1/apps")
      .set("Authorization", authHeader(user.id))
      .send({ name: "Point of Sale", key: "POS_APP" });
    const updateResponse = await request(app)
      .patch("/user/api/v1/apps/POS_APP/details")
      .set("Authorization", authHeader(user.id))
      .send({ name: "Changed" });

    expect(registerResponse.status).toBe(404);
    expect(updateResponse.status).toBe(404);
  });

  it("lists and returns only active apps to business users", async () => {
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

    const ignoredQueryResponse = await request(app)
      .get("/user/api/v1/apps?includeDisabled=true")
      .set("Authorization", authHeader(user.id));
    const disabledDetailsResponse = await request(app)
      .get("/user/api/v1/apps/accounting")
      .set("Authorization", authHeader(user.id));

    expect(ignoredQueryResponse.body.data.apps.map((item: any) => item.key)).toEqual([
      "inventory",
    ]);
    expect(disabledDetailsResponse.status).toBe(404);
  });

  it("lets authenticated super-admins manage apps", async () => {
    const superAdmin = await createTestSuperAdmin();
    const otherSuperAdmin = await createTestSuperAdmin();

    const createResponse = await request(app)
      .post("/super-admin/api/v1/apps")
      .set("Authorization", superAdminAuthHeader(otherSuperAdmin.id))
      .send({
        name: "Accounting",
        key: "accounting",
        description: "Finance app",
      });
    expect(createResponse.status).toBe(201);
    expect(createResponse.body.data.app.status).toBe(AppStatus.DISABLED);

    const duplicateResponse = await request(app)
      .post("/super-admin/api/v1/apps")
      .set("Authorization", superAdminAuthHeader(superAdmin.id))
      .send({ name: "Duplicate Accounting", key: "accounting" });
    expect(duplicateResponse.status).toBe(409);

    const statusResponse = await request(app)
      .patch("/super-admin/api/v1/apps/accounting/status")
      .set(
        "Authorization",
        superAdminAuthHeader(superAdmin.id),
      )
      .send({ status: AppStatus.ACTIVE });
    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.data.app.status).toBe(AppStatus.ACTIVE);

    const updateResponse = await request(app)
      .patch("/super-admin/api/v1/apps/accounting/details")
      .set("Authorization", superAdminAuthHeader(otherSuperAdmin.id))
      .send({ name: "Accounting Suite", description: null });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.data.app.name).toBe("Accounting Suite");

    const listResponse = await request(app)
      .get("/super-admin/api/v1/apps")
      .set(
        "Authorization",
        superAdminAuthHeader(superAdmin.id),
      );
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data.apps).toHaveLength(1);
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
