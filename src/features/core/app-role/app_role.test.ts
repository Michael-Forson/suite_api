/// <reference types="jest" />
import express from "express";
import { jest } from "@jest/globals";
import request from "supertest";
import {
  AppStatus,
  MemberStatus,
  OrganizationAppStatus,
  OrganizationRole,
  AppPermissionStatus,
  RoleStatus,
} from "../../../generated/prisma/enums.js";
import { requireAppPermission } from "../../../middleware/users/appPermission.middleware.js";
import { authenticate } from "../../../middleware/users/auth.middleware.js";
import { prisma } from "../../../prisma.js";
import { authHeader, superAdminAuthHeader } from "../../../test-utils/auth.js";
import {
  assignTestAppRole,
  createTestApp,
  createTestAppRole,
  createTestMember,
  createTestOrganization,
  createTestOrganizationApp,
  createTestPermission,
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

const setupOrganizationApp = async () => {
  const organizationSetup = await createTestOrganization();
  const appRecord = await createTestApp({ key: "accounting" });
  await createTestOrganizationApp({
    organizationId: organizationSetup.organization.id,
    app: appRecord,
    enabledBy: organizationSetup.owner.id,
  });
  return { ...organizationSetup, appRecord };
};

describe("organization app role access", () => {
  it("uses the default role, explicit assignment, and fallback after removal", async () => {
    const { organization, owner, appRecord } = await setupOrganizationApp();
    const { user: memberUser, member } = await createTestMember({
      organizationId: organization.id,
    });
    const view = await createTestPermission({
      appId: appRecord.id,
      key: "invoice.view",
    });
    const edit = await createTestPermission({
      appId: appRecord.id,
      key: "invoice.edit",
    });
    await createTestAppRole({
      appId: appRecord.id,
      key: "staff",
      name: "Staff",
      isDefault: true,
      appPermissionIds: [view.id],
    });
    await createTestAppRole({
      appId: appRecord.id,
      key: "manager",
      name: "Manager",
      appPermissionIds: [view.id, edit.id],
    });

    const fallback = await request(app)
      .get(
        `/user/api/v1/organizations/${organization.id}/apps/accounting/my-access`,
      )
      .set("Authorization", authHeader(memberUser.id));
    expect(fallback.status).toBe(200);
    expect(fallback.body.data.access.source).toBe("DEFAULT_ROLE");
    expect(fallback.body.data.access.permissions).toEqual(["invoice.view"]);

    const assignment = await request(app)
      .put(
        `/user/api/v1/organizations/${organization.id}/apps/accounting/members/${member.id}/role`,
      )
      .set("Authorization", authHeader(owner.id))
      .send({ roleKey: "manager" });
    expect(assignment.status).toBe(200);

    const explicit = await request(app)
      .get(
        `/user/api/v1/organizations/${organization.id}/apps/accounting/my-access`,
      )
      .set("Authorization", authHeader(memberUser.id));
    expect(explicit.body.data.access.source).toBe("EXPLICIT_ROLE");
    expect(explicit.body.data.access.permissions).toEqual([
      "invoice.edit",
      "invoice.view",
    ]);

    const removal = await request(app)
      .delete(
        `/user/api/v1/organizations/${organization.id}/apps/accounting/members/${member.id}/role`,
      )
      .set("Authorization", authHeader(owner.id));
    expect(removal.status).toBe(200);

    const restoredFallback = await request(app)
      .get(
        `/user/api/v1/organizations/${organization.id}/apps/accounting/my-access`,
      )
      .set("Authorization", authHeader(memberUser.id));
    expect(restoredFallback.body.data.access.source).toBe("DEFAULT_ROLE");
  });

  it("applies permission and role disabling immediately", async () => {
    const { organization, owner, appRecord } = await setupOrganizationApp();
    const superAdmin = await createTestSuperAdmin();
    const { user: memberUser, member } = await createTestMember({
      organizationId: organization.id,
    });
    const view = await createTestPermission({
      appId: appRecord.id,
      key: "invoice.view",
    });
    const edit = await createTestPermission({
      appId: appRecord.id,
      key: "invoice.edit",
    });
    await createTestAppRole({
      appId: appRecord.id,
      key: "staff",
      name: "Staff",
      isDefault: true,
      appPermissionIds: [view.id],
    });
    const manager = await createTestAppRole({
      appId: appRecord.id,
      key: "manager",
      name: "Manager",
      appPermissionIds: [view.id, edit.id],
    });
    await assignTestAppRole({
      organizationMemberId: member.id,
      appId: appRecord.id,
      appRoleId: manager.id,
      assignedBy: owner.id,
    });

    await request(app)
      .patch(
        "/super-admin/api/v1/apps/accounting/permissions/invoice.edit/status",
      )
      .set("Authorization", superAdminAuthHeader(superAdmin.id))
      .send({ status: AppPermissionStatus.DISABLED })
      .expect(200);

    const afterPermissionDisable = await request(app)
      .get(
        `/user/api/v1/organizations/${organization.id}/apps/accounting/my-access`,
      )
      .set("Authorization", authHeader(memberUser.id));
    expect(afterPermissionDisable.body.data.access.permissions).toEqual([
      "invoice.view",
    ]);

    await request(app)
      .patch("/super-admin/api/v1/apps/accounting/roles/manager/status")
      .set("Authorization", superAdminAuthHeader(superAdmin.id))
      .send({ status: RoleStatus.DISABLED })
      .expect(200);

    const afterRoleDisable = await request(app)
      .get(
        `/user/api/v1/organizations/${organization.id}/apps/accounting/my-access`,
      )
      .set("Authorization", authHeader(memberUser.id));
    expect(afterRoleDisable.body.data.access.source).toBe("DEFAULT_ROLE");
  });

  it("does not grant access from a role belonging to another app", async () => {
    const { organization, owner, appRecord } = await setupOrganizationApp();
    const { user: memberUser, member } = await createTestMember({
      organizationId: organization.id,
    });
    const fallbackPermission = await createTestPermission({
      appId: appRecord.id,
      key: "invoice.view",
    });
    await createTestAppRole({
      appId: appRecord.id,
      key: "staff",
      name: "Staff",
      isDefault: true,
      appPermissionIds: [fallbackPermission.id],
    });

    const otherApp = await createTestApp({ key: "inventory" });
    const foreignPermission = await createTestPermission({
      appId: otherApp.id,
      key: "inventory.manage",
    });
    const foreignGlobalRole = await createTestAppRole({
      appId: otherApp.id,
      key: "inventory-manager",
      name: "Inventory Manager",
      appPermissionIds: [foreignPermission.id],
    });
    await prisma.memberAppRole.create({
      data: {
        organizationMemberId: member.id,
        appId: appRecord.id,
        appRoleId: foreignGlobalRole.id,
        assignedBy: owner.id,
      },
    });

    const globalMismatch = await request(app)
      .get(
        `/user/api/v1/organizations/${organization.id}/apps/accounting/my-access`,
      )
      .set("Authorization", authHeader(memberUser.id));
    expect(globalMismatch.status).toBe(200);
    expect(globalMismatch.body.data.access.source).toBe("DEFAULT_ROLE");
    expect(globalMismatch.body.data.access.permissions).toEqual([
      "invoice.view",
    ]);
  });

  it("gives owners and admins active-permission bypass access", async () => {
    const { organization, owner, appRecord } = await setupOrganizationApp();
    const { user: adminUser } = await createTestMember({
      organizationId: organization.id,
      organizationRole: OrganizationRole.ADMIN,
    });
    await createTestPermission({
      appId: appRecord.id,
      key: "invoice.view",
    });
    await createTestPermission({
      appId: appRecord.id,
      key: "invoice.disabled",
      status: AppPermissionStatus.DISABLED,
    });

    for (const user of [owner, adminUser]) {
      const response = await request(app)
        .get(
          `/user/api/v1/organizations/${organization.id}/apps/accounting/my-access`,
        )
        .set("Authorization", authHeader(user.id));
      expect(response.status).toBe(200);
      expect(response.body.data.access.source).toBe("ORGANIZATION_ROLE");
      expect(response.body.data.access.bypass).toBe(true);
      expect(response.body.data.access.permissions).toEqual(["invoice.view"]);
    }
  });

  it("allows only owners and admins to list and assign app roles", async () => {
    const { organization, owner, appRecord } = await setupOrganizationApp();
    const { user: memberUser, member } = await createTestMember({
      organizationId: organization.id,
    });
    await createTestAppRole({
      appId: appRecord.id,
      key: "staff",
      name: "Staff",
    });

    const memberList = await request(app)
      .get(
        `/user/api/v1/organizations/${organization.id}/apps/accounting/roles`,
      )
      .set("Authorization", authHeader(memberUser.id));
    expect(memberList.status).toBe(403);

    const ownerList = await request(app)
      .get(
        `/user/api/v1/organizations/${organization.id}/apps/accounting/roles`,
      )
      .set("Authorization", authHeader(owner.id));
    expect(ownerList.status).toBe(200);

    await prisma.organizationMember.update({
      where: { id: member.id },
      data: { status: MemberStatus.SUSPENDED },
    });
    const assignment = await request(app)
      .put(
        `/user/api/v1/organizations/${organization.id}/apps/accounting/members/${member.id}/role`,
      )
      .set("Authorization", authHeader(owner.id))
      .send({ roleKey: "staff" });
    expect(assignment.status).toBe(409);
  });

  it("blocks access when the app, organization app, or membership is inactive", async () => {
    const { organization, appRecord } = await setupOrganizationApp();
    const { user: memberUser, member } = await createTestMember({
      organizationId: organization.id,
    });
    const path = `/user/api/v1/organizations/${organization.id}/apps/accounting/my-access`;

    await prisma.organizationApp.update({
      where: {
        organizationId_appId: {
          organizationId: organization.id,
          appId: appRecord.id,
        },
      },
      data: { status: OrganizationAppStatus.DISABLED },
    });
    await request(app)
      .get(path)
      .set("Authorization", authHeader(memberUser.id))
      .expect(403);

    await prisma.organizationApp.update({
      where: {
        organizationId_appId: {
          organizationId: organization.id,
          appId: appRecord.id,
        },
      },
      data: { status: OrganizationAppStatus.ACTIVE },
    });
    await prisma.app.update({
      where: { id: appRecord.id },
      data: { status: AppStatus.DISABLED },
    });
    await request(app)
      .get(path)
      .set("Authorization", authHeader(memberUser.id))
      .expect(404);

    await prisma.app.update({
      where: { id: appRecord.id },
      data: { status: AppStatus.ACTIVE },
    });
    await prisma.organizationMember.update({
      where: { id: member.id },
      data: { status: MemberStatus.SUSPENDED },
    });
    await request(app)
      .get(path)
      .set("Authorization", authHeader(memberUser.id))
      .expect(403);
  });
});

describe("app permission middleware", () => {
  it("enforces permissions while allowing owner bypass", async () => {
    const { organization, owner, appRecord } = await setupOrganizationApp();
    const { user: memberUser } = await createTestMember({
      organizationId: organization.id,
    });
    const view = await createTestPermission({
      appId: appRecord.id,
      key: "invoice.view",
    });
    await createTestAppRole({
      appId: appRecord.id,
      key: "staff",
      name: "Staff",
      isDefault: true,
      appPermissionIds: [view.id],
    });

    const protectedApp = express();
    protectedApp.get(
      "/organizations/:organizationId/apps/:appKey/protected",
      authenticate,
      requireAppPermission("invoice.edit"),
      (_req, res) => res.status(200).json({ success: true }),
    );
    const path = `/organizations/${organization.id}/apps/accounting/protected`;

    await request(protectedApp)
      .get(path)
      .set("Authorization", authHeader(memberUser.id))
      .expect(403);
    await request(protectedApp)
      .get(path)
      .set("Authorization", authHeader(owner.id))
      .expect(403);

    await prisma.appPermission.create({
      data: {
        appId: appRecord.id,
        key: "invoice.edit",
        label: "Edit invoices",
      },
    });
    await request(protectedApp)
      .get(path)
      .set("Authorization", authHeader(owner.id))
      .expect(200);
  });
});
