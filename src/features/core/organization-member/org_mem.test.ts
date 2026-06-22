/// <reference types="jest" />
import request from "supertest";
import { OrganizationRole } from "../../../generated/prisma/enums.js";
import { prisma } from "../../../prisma.js";
import { authHeader } from "../../../test-utils/auth.js";
import {
  createTestMember,
  createTestOrganization,
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

describe("organization member endpoints", () => {
  it("allows owners and admins to list organization members with string ids", async () => {
    const { organization, owner } = await createTestOrganization();
    const { user: admin } = await createTestMember({
      organizationId: organization.id,
      organizationRole: OrganizationRole.ADMIN,
    });
    await createTestMember({ organizationId: organization.id });

    const ownerResponse = await request(app)
      .get(`/user/api/v1/organizations/${organization.id}/members`)
      .set("Authorization", authHeader(owner.id));

    expect(ownerResponse.status).toBe(200);
    expect(ownerResponse.body.data.members).toHaveLength(3);
    expect(typeof ownerResponse.body.data.members[0].id).toBe("string");
    expect(typeof ownerResponse.body.data.members[0].user.id).toBe("string");

    const adminResponse = await request(app)
      .get(`/user/api/v1/organizations/${organization.id}/members`)
      .set("Authorization", authHeader(admin.id));

    expect(adminResponse.status).toBe(200);
    expect(adminResponse.body.data.members).toHaveLength(3);
  });

  it("blocks regular members from managing members", async () => {
    const { organization } = await createTestOrganization();
    const { user: regularUser } = await createTestMember({
      organizationId: organization.id,
    });
    const { member: targetMember } = await createTestMember({
      organizationId: organization.id,
    });

    const response = await request(app)
      .patch(
        `/user/api/v1/organizations/${organization.id}/members/${targetMember.id}/job-title`,
      )
      .set("Authorization", authHeader(regularUser.id))
      .send({ jobTitle: "Lead" });

    expect(response.status).toBe(403);
  });

  it("allows the owner to update role, status, job title, and remove non-owner members", async () => {
    const { organization, owner } = await createTestOrganization();
    const { member } = await createTestMember({ organizationId: organization.id });

    const jobTitleResponse = await request(app)
      .patch(
        `/user/api/v1/organizations/${organization.id}/members/${member.id}/job-title`,
      )
      .set("Authorization", authHeader(owner.id))
      .send({ jobTitle: "Operations Manager" });

    expect(jobTitleResponse.status).toBe(200);
    expect(jobTitleResponse.body.data.member.jobTitle).toBe("Operations Manager");

    const roleResponse = await request(app)
      .patch(`/user/api/v1/organizations/${organization.id}/members/${member.id}/role`)
      .set("Authorization", authHeader(owner.id))
      .send({ organizationRole: "ADMIN" });

    expect(roleResponse.status).toBe(200);
    expect(roleResponse.body.data.member.organizationRole).toBe("ADMIN");

    const statusResponse = await request(app)
      .patch(
        `/user/api/v1/organizations/${organization.id}/members/${member.id}/status`,
      )
      .set("Authorization", authHeader(owner.id))
      .send({ status: "SUSPENDED" });

    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.data.member.status).toBe("SUSPENDED");

    const removeResponse = await request(app)
      .delete(`/user/api/v1/organizations/${organization.id}/members/${member.id}`)
      .set("Authorization", authHeader(owner.id));

    expect(removeResponse.status).toBe(200);
    await expect(
      prisma.organizationMember.findUnique({ where: { id: member.id } }),
    ).resolves.toBeNull();
  });

  it("prevents admins from managing owners or other admins", async () => {
    const { organization, ownerMember } = await createTestOrganization();
    const { user: admin } = await createTestMember({
      organizationId: organization.id,
      organizationRole: OrganizationRole.ADMIN,
    });
    const { member: otherAdminMember } = await createTestMember({
      organizationId: organization.id,
      organizationRole: OrganizationRole.ADMIN,
    });

    const ownerResponse = await request(app)
      .delete(
        `/user/api/v1/organizations/${organization.id}/members/${ownerMember.id}`,
      )
      .set("Authorization", authHeader(admin.id));

    expect(ownerResponse.status).toBe(403);

    const adminResponse = await request(app)
      .patch(
        `/user/api/v1/organizations/${organization.id}/members/${otherAdminMember.id}/status`,
      )
      .set("Authorization", authHeader(admin.id))
      .send({ status: "SUSPENDED" });

    expect(adminResponse.status).toBe(403);
  });

  it("prevents owner demotion, suspension, and removal", async () => {
    const { organization, owner, ownerMember } = await createTestOrganization();

    const roleResponse = await request(app)
      .patch(
        `/user/api/v1/organizations/${organization.id}/members/${ownerMember.id}/role`,
      )
      .set("Authorization", authHeader(owner.id))
      .send({ organizationRole: "MEMBER" });

    expect(roleResponse.status).toBe(403);

    const statusResponse = await request(app)
      .patch(
        `/user/api/v1/organizations/${organization.id}/members/${ownerMember.id}/status`,
      )
      .set("Authorization", authHeader(owner.id))
      .send({ status: "SUSPENDED" });

    expect(statusResponse.status).toBe(403);

    const removeResponse = await request(app)
      .delete(
        `/user/api/v1/organizations/${organization.id}/members/${ownerMember.id}`,
      )
      .set("Authorization", authHeader(owner.id));

    expect(removeResponse.status).toBe(403);
  });

  it("rejects invalid member roles and statuses", async () => {
    const { organization, owner } = await createTestOrganization();
    const { member } = await createTestMember({ organizationId: organization.id });

    const roleResponse = await request(app)
      .patch(`/user/api/v1/organizations/${organization.id}/members/${member.id}/role`)
      .set("Authorization", authHeader(owner.id))
      .send({ organizationRole: "OWNER" });

    expect(roleResponse.status).toBe(400);

    const statusResponse = await request(app)
      .patch(
        `/user/api/v1/organizations/${organization.id}/members/${member.id}/status`,
      )
      .set("Authorization", authHeader(owner.id))
      .send({ status: "PENDING" });

    expect(statusResponse.status).toBe(400);
  });
});
