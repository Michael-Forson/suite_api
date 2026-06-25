/// <reference types="jest" />
import request from "supertest";
import { AppStatus } from "../../../generated/prisma/enums.js";
import { authHeader, superAdminAuthHeader } from "../../../test-utils/auth.js";
import {
  createTestSuperAdmin,
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

describe("super-admin app registry management", () => {
  it("creates, updates, activates, and lists apps", async () => {
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
      .set("Authorization", superAdminAuthHeader(superAdmin.id))
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
      .set("Authorization", superAdminAuthHeader(superAdmin.id));
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data.apps).toHaveLength(1);
  });

  it("rejects business-user tokens on app management routes", async () => {
    const user = await createTestUser();

    const response = await request(app)
      .post("/super-admin/api/v1/apps")
      .set("Authorization", authHeader(user.id))
      .send({ name: "Accounting", key: "accounting" });

    expect(response.status).toBe(401);
  });
});
