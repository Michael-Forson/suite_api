/// <reference types="jest" />
import request from "supertest";
import { SuperAdminStatus } from "../../../generated/prisma/enums.js";
import { superAdminAuthHeader } from "../../../test-utils/auth.js";
import { createTestSuperAdmin } from "../../../test-utils/factories.js";
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

describe("super-admin account management", () => {
  it("creates, updates, lists, and disables super-admin accounts", async () => {
    const currentSuperAdmin = await createTestSuperAdmin();

    const createResponse = await request(app)
      .post("/super-admin/api/v1/accounts")
      .set("Authorization", superAdminAuthHeader(currentSuperAdmin.id))
      .send({
        firstName: "Grace",
        lastName: "Hopper",
        email: "grace@example.test",
        password: "Password123!",
      });
    expect(createResponse.status).toBe(201);
    const newSuperAdminId = createResponse.body.data.superAdmin.id;

    const updateResponse = await request(app)
      .patch(`/super-admin/api/v1/accounts/${newSuperAdminId}`)
      .set("Authorization", superAdminAuthHeader(currentSuperAdmin.id))
      .send({ firstName: "Amazing Grace" });
    expect(updateResponse.status).toBe(200);

    const statusResponse = await request(app)
      .patch(`/super-admin/api/v1/accounts/${newSuperAdminId}/status`)
      .set("Authorization", superAdminAuthHeader(currentSuperAdmin.id))
      .send({ status: SuperAdminStatus.DISABLED });
    expect(statusResponse.status).toBe(200);

    const listResponse = await request(app)
      .get("/super-admin/api/v1/accounts")
      .set("Authorization", superAdminAuthHeader(currentSuperAdmin.id));
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data.superAdmins).toHaveLength(2);
  });

  it("prevents a super-admin from disabling its own account", async () => {
    const superAdmin = await createTestSuperAdmin();

    const response = await request(app)
      .patch(`/super-admin/api/v1/accounts/${superAdmin.id}/status`)
      .set("Authorization", superAdminAuthHeader(superAdmin.id))
      .send({ status: SuperAdminStatus.DISABLED });

    expect(response.status).toBe(409);
  });

  it("validates privileged account input and password changes", async () => {
    const currentSuperAdmin = await createTestSuperAdmin();
    const otherSuperAdmin = await createTestSuperAdmin();

    const invalidCreateResponse = await request(app)
      .post("/super-admin/api/v1/accounts")
      .set("Authorization", superAdminAuthHeader(currentSuperAdmin.id))
      .send({
        firstName: "Bad",
        lastName: "Input",
        email: "not-an-email",
        password: "short",
      });
    expect(invalidCreateResponse.status).toBe(400);

    const duplicateCreateResponse = await request(app)
      .post("/super-admin/api/v1/accounts")
      .set("Authorization", superAdminAuthHeader(currentSuperAdmin.id))
      .send({
        firstName: "Duplicate",
        lastName: "Account",
        email: otherSuperAdmin.email,
        password: "Password123!",
      });
    expect(duplicateCreateResponse.status).toBe(409);

    const otherPasswordResponse = await request(app)
      .patch(`/super-admin/api/v1/accounts/${otherSuperAdmin.id}`)
      .set("Authorization", superAdminAuthHeader(currentSuperAdmin.id))
      .send({
        currentPassword: "Password123!",
        password: "NewPassword123!",
      });
    expect(otherPasswordResponse.status).toBe(403);

    const wrongCurrentPasswordResponse = await request(app)
      .patch(`/super-admin/api/v1/accounts/${currentSuperAdmin.id}`)
      .set("Authorization", superAdminAuthHeader(currentSuperAdmin.id))
      .send({
        currentPassword: "wrong-password",
        password: "NewPassword123!",
      });
    expect(wrongCurrentPasswordResponse.status).toBe(401);

    const ownPasswordResponse = await request(app)
      .patch(`/super-admin/api/v1/accounts/${currentSuperAdmin.id}`)
      .set("Authorization", superAdminAuthHeader(currentSuperAdmin.id))
      .send({
        currentPassword: "Password123!",
        password: "NewPassword123!",
      });
    expect(ownPasswordResponse.status).toBe(200);
  });
});
