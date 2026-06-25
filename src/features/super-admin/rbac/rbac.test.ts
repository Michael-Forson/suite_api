/// <reference types="jest" />
import { jest } from "@jest/globals";
import request from "supertest";
import { RoleStatus } from "../../../generated/prisma/enums.js";
import { authHeader, superAdminAuthHeader } from "../../../test-utils/auth.js";
import {
  createTestApp,
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
jest.setTimeout(60000);

beforeEach(async () => {
  mockedSendTemplateEmail.mockClear();
  await truncateTestDatabase();
});

afterAll(async () => {
  await disconnectTestDatabase();
});

describe("super-admin RBAC management", () => {
  it("creates permissions and roles, replaces permissions, and protects the default role", async () => {
    const superAdmin = await createTestSuperAdmin();
    await createTestApp({ key: "accounting" });
    const authorization = superAdminAuthHeader(superAdmin.id);

    const createView = await request(app)
      .post("/super-admin/api/v1/apps/accounting/permissions")
      .set("Authorization", authorization)
      .send({
        key: "invoice.view",
        label: "View invoices",
        category: "Invoices",
      });
    const createEdit = await request(app)
      .post("/super-admin/api/v1/apps/accounting/permissions")
      .set("Authorization", authorization)
      .send({ key: "invoice.edit", label: "Edit invoices" });
    expect(createView.status).toBe(201);
    expect(createEdit.status).toBe(201);

    const duplicatePermission = await request(app)
      .post("/super-admin/api/v1/apps/accounting/permissions")
      .set("Authorization", authorization)
      .send({ key: "invoice.view", label: "Duplicate" });
    expect(duplicatePermission.status).toBe(409);

    const createRole = await request(app)
      .post("/super-admin/api/v1/apps/accounting/roles")
      .set("Authorization", authorization)
      .send({
        key: "staff",
        name: "Staff",
        permissionKeys: ["invoice.view"],
      });
    expect(createRole.status).toBe(201);
    expect(createRole.body.data.role.permissions).toHaveLength(1);

    const replacePermissions = await request(app)
      .put("/super-admin/api/v1/apps/accounting/roles/staff/permissions")
      .set("Authorization", authorization)
      .send({ permissionKeys: ["invoice.view", "invoice.edit"] });
    expect(replacePermissions.status).toBe(200);
    expect(
      replacePermissions.body.data.role.permissions.map(
        (permission: { key: string }) => permission.key,
      ),
    ).toEqual(["invoice.edit", "invoice.view"]);

    const setDefault = await request(app)
      .patch("/super-admin/api/v1/apps/accounting/roles/staff/default")
      .set("Authorization", authorization);
    expect(setDefault.status).toBe(200);
    expect(setDefault.body.data.role.isDefault).toBe(true);

    const disableDefault = await request(app)
      .patch("/super-admin/api/v1/apps/accounting/roles/staff/status")
      .set("Authorization", authorization)
      .send({ status: RoleStatus.DISABLED });
    expect(disableDefault.status).toBe(409);
  });

  it("rejects business-user tokens on RBAC management routes", async () => {
    const user = await createTestUser();
    await createTestApp({ key: "accounting" });

    const response = await request(app)
      .post("/super-admin/api/v1/apps/accounting/permissions")
      .set("Authorization", authHeader(user.id))
      .send({ key: "invoice.view", label: "View invoices" });

    expect(response.status).toBe(401);
  });
});
