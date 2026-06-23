/// <reference types="jest" />
import request from "supertest";
import {
  AccountStatus,
  MemberStatus,
  OrganizationRole,
} from "../../../generated/prisma/enums.js";
import { prisma } from "../../../prisma.js";
import { authHeader } from "../../../test-utils/auth.js";
import {
  createTestMember,
  createTestOrganization,
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

describe("organization endpoints", () => {
  it("creates an organization, unique slug, and owner membership", async () => {
    const user = await createTestUser();

    const firstResponse = await request(app)
      .post("/user/api/v1/organizations")
      .set("Authorization", authHeader(user.id))
      .send({
        name: "Acme Logistics",
        email: "ops@acme.test",
        phone: "+2348012345",
        country: "Nigeria",
      });

    expect(firstResponse.status).toBe(201);
    expect(firstResponse.body.data.organization).toMatchObject({
      name: "Acme Logistics",
      slug: "acme-logistics",
      ownerId: user.id.toString(),
    });
    expect(typeof firstResponse.body.data.organization.id).toBe("string");

    const ownerMember = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: BigInt(firstResponse.body.data.organization.id),
          userId: user.id,
        },
      },
    });
    expect(ownerMember?.organizationRole).toBe(OrganizationRole.OWNER);
    expect(ownerMember?.status).toBe(MemberStatus.ACTIVE);

    const secondResponse = await request(app)
      .post("/user/api/v1/organizations")
      .set("Authorization", authHeader(user.id))
      .send({ name: "Acme Logistics" });

    expect(secondResponse.status).toBe(201);
    expect(secondResponse.body.data.organization.slug).toBe("acme-logistics-1");
  });

  it("validates organization creation input", async () => {
    const user = await createTestUser();

    const missingNameResponse = await request(app)
      .post("/user/api/v1/organizations")
      .set("Authorization", authHeader(user.id))
      .send({ email: "ops@example.test" });

    expect(missingNameResponse.status).toBe(400);

    const invalidEmailResponse = await request(app)
      .post("/user/api/v1/organizations")
      .set("Authorization", authHeader(user.id))
      .send({ name: "Bad Contact", email: "not-an-email" });

    expect(invalidEmailResponse.status).toBe(400);
  });

  it("lists only organizations the authenticated user belongs to", async () => {
    const visibleOwnerOrg = await createTestOrganization();
    const memberUser = await createTestUser();
    const visibleMemberOrg = await createTestOrganization();
    await createTestMember({
      organizationId: visibleMemberOrg.organization.id,
      user: memberUser,
    });
    await createTestOrganization();

    const ownerListResponse = await request(app)
      .get("/user/api/v1/organizations")
      .set("Authorization", authHeader(visibleOwnerOrg.owner.id));

    expect(ownerListResponse.status).toBe(200);
    expect(ownerListResponse.body.data.organizations).toHaveLength(1);
    expect(ownerListResponse.body.data.organizations[0].id).toBe(
      visibleOwnerOrg.organization.id.toString(),
    );

    const memberListResponse = await request(app)
      .get("/user/api/v1/organizations")
      .set("Authorization", authHeader(memberUser.id));

    expect(memberListResponse.status).toBe(200);
    expect(memberListResponse.body.data.organizations).toHaveLength(1);
    expect(memberListResponse.body.data.organizations[0].id).toBe(
      visibleMemberOrg.organization.id.toString(),
    );
  });

  it("lists inactive organizations for owners but not members", async () => {
    const inactiveOwnerOrg = await createTestOrganization(null, {
      status: AccountStatus.SUSPENDED,
    });
    const memberUser = await createTestUser();
    const inactiveMemberOrg = await createTestOrganization(null, {
      status: AccountStatus.SUSPENDED,
    });
    await createTestMember({
      organizationId: inactiveMemberOrg.organization.id,
      user: memberUser,
    });

    const ownerListResponse = await request(app)
      .get("/user/api/v1/organizations")
      .set("Authorization", authHeader(inactiveOwnerOrg.owner.id));

    expect(ownerListResponse.status).toBe(200);
    expect(ownerListResponse.body.data.organizations).toHaveLength(1);
    expect(ownerListResponse.body.data.organizations[0]).toMatchObject({
      id: inactiveOwnerOrg.organization.id.toString(),
      status: AccountStatus.SUSPENDED,
    });

    const memberListResponse = await request(app)
      .get("/user/api/v1/organizations")
      .set("Authorization", authHeader(memberUser.id));

    expect(memberListResponse.status).toBe(200);
    expect(memberListResponse.body.data.organizations).toHaveLength(0);
  });

  it("gets details for active members and rejects non-members", async () => {
    const { organization } = await createTestOrganization();
    const { user: member } = await createTestMember({
      organizationId: organization.id,
    });
    const outsider = await createTestUser();

    const memberResponse = await request(app)
      .get(`/user/api/v1/organizations/${organization.id}`)
      .set("Authorization", authHeader(member.id));

    expect(memberResponse.status).toBe(200);
    expect(memberResponse.body.data.organization.id).toBe(
      organization.id.toString(),
    );
    expect(memberResponse.body.data.organization.members[0].userId).toBe(
      member.id.toString(),
    );

    const outsiderResponse = await request(app)
      .get(`/user/api/v1/organizations/${organization.id}`)
      .set("Authorization", authHeader(outsider.id));

    expect(outsiderResponse.status).toBe(403);
  });

  it("allows owners and admins to update profile, but blocks members", async () => {
    const { organization, owner } = await createTestOrganization();
    const { user: admin } = await createTestMember({
      organizationId: organization.id,
      organizationRole: OrganizationRole.ADMIN,
    });
    const { user: member } = await createTestMember({
      organizationId: organization.id,
    });

    const ownerResponse = await request(app)
      .patch(`/user/api/v1/organizations/${organization.id}/profile`)
      .set("Authorization", authHeader(owner.id))
      .send({ name: "Updated Name", slug: "Updated Name", city: "Lagos" });

    expect(ownerResponse.status).toBe(200);
    expect(ownerResponse.body.data.organization).toMatchObject({
      name: "Updated Name",
      slug: "updated-name",
      city: "Lagos",
    });

    const adminResponse = await request(app)
      .patch(`/user/api/v1/organizations/${organization.id}/profile`)
      .set("Authorization", authHeader(admin.id))
      .send({ industry: "Retail" });

    expect(adminResponse.status).toBe(200);
    expect(adminResponse.body.data.organization.industry).toBe("Retail");

    const memberResponse = await request(app)
      .patch(`/user/api/v1/organizations/${organization.id}/profile`)
      .set("Authorization", authHeader(member.id))
      .send({ city: "Abuja" });

    expect(memberResponse.status).toBe(403);
  });

  it("rejects invalid profile field types and duplicate slugs", async () => {
    const { organization, owner } = await createTestOrganization();
    const duplicate = await createTestOrganization();

    const invalidEmailResponse = await request(app)
      .patch(`/user/api/v1/organizations/${organization.id}/profile`)
      .set("Authorization", authHeader(owner.id))
      .send({ email: 123 });

    expect(invalidEmailResponse.status).toBe(400);

    const invalidPhoneResponse = await request(app)
      .patch(`/user/api/v1/organizations/${organization.id}/profile`)
      .set("Authorization", authHeader(owner.id))
      .send({ phone: {} });

    expect(invalidPhoneResponse.status).toBe(400);

    const duplicateSlugResponse = await request(app)
      .patch(`/user/api/v1/organizations/${organization.id}/profile`)
      .set("Authorization", authHeader(owner.id))
      .send({ slug: duplicate.organization.slug });

    expect(duplicateSlugResponse.status).toBe(409);
  });

  it("allows only owners to change organization status", async () => {
    const { organization, owner } = await createTestOrganization();
    const { user: admin } = await createTestMember({
      organizationId: organization.id,
      organizationRole: OrganizationRole.ADMIN,
    });

    const invalidResponse = await request(app)
      .patch(`/user/api/v1/organizations/${organization.id}/status`)
      .set("Authorization", authHeader(owner.id))
      .send({ status: "ARCHIVED" });

    expect(invalidResponse.status).toBe(400);

    const adminResponse = await request(app)
      .patch(`/user/api/v1/organizations/${organization.id}/status`)
      .set("Authorization", authHeader(admin.id))
      .send({ status: AccountStatus.SUSPENDED });

    expect(adminResponse.status).toBe(403);

    const ownerResponse = await request(app)
      .patch(`/user/api/v1/organizations/${organization.id}/status`)
      .set("Authorization", authHeader(owner.id))
      .send({ status: AccountStatus.SUSPENDED });

    expect(ownerResponse.status).toBe(200);
    expect(ownerResponse.body.data.organization.status).toBe(
      AccountStatus.SUSPENDED,
    );
  });

  it("blocks inactive organizations but allows owners to restore status", async () => {
    const { organization, owner } = await createTestOrganization(null, {
      status: AccountStatus.SUSPENDED,
    });
    const { user: admin } = await createTestMember({
      organizationId: organization.id,
      organizationRole: OrganizationRole.ADMIN,
    });

    const detailResponse = await request(app)
      .get(`/user/api/v1/organizations/${organization.id}`)
      .set("Authorization", authHeader(owner.id));

    expect(detailResponse.status).toBe(403);

    const adminProfileResponse = await request(app)
      .patch(`/user/api/v1/organizations/${organization.id}/profile`)
      .set("Authorization", authHeader(admin.id))
      .send({ city: "Lagos" });

    expect(adminProfileResponse.status).toBe(403);

    const restoreResponse = await request(app)
      .patch(`/user/api/v1/organizations/${organization.id}/status`)
      .set("Authorization", authHeader(owner.id))
      .send({ status: AccountStatus.ACTIVE });

    expect(restoreResponse.status).toBe(200);
    expect(restoreResponse.body.data.organization.status).toBe(
      AccountStatus.ACTIVE,
    );
  });

  it("blocks inactive users from organization routes", async () => {
    const inactiveUser = await createTestUser({
      isActive: false,
      status: AccountStatus.DISABLED,
    });
    const { organization } = await createTestOrganization(inactiveUser);

    const listResponse = await request(app)
      .get("/user/api/v1/organizations")
      .set("Authorization", authHeader(inactiveUser.id));

    expect(listResponse.status).toBe(403);

    const detailResponse = await request(app)
      .get(`/user/api/v1/organizations/${organization.id}`)
      .set("Authorization", authHeader(inactiveUser.id));

    expect(detailResponse.status).toBe(403);

    const statusResponse = await request(app)
      .patch(`/user/api/v1/organizations/${organization.id}/status`)
      .set("Authorization", authHeader(inactiveUser.id))
      .send({ status: AccountStatus.ACTIVE });

    expect(statusResponse.status).toBe(403);
  });

  it("handles concurrent create requests for the same slug", async () => {
    const user = await createTestUser();

    const responses = await Promise.all(
      [1, 2].map(() =>
        request(app)
          .post("/user/api/v1/organizations")
          .set("Authorization", authHeader(user.id))
          .send({ name: "Concurrent Org" }),
      ),
    );

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 201,
    ]);
    expect(
      new Set(
        responses.map((response) => response.body.data.organization.slug),
      ).size,
    ).toBe(2);
  });
});
