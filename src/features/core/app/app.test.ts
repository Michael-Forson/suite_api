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

describe("business-user app discovery endpoints", () => {
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
