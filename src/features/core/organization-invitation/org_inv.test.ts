/// <reference types="jest" />
import request from "supertest";
import {
  InvitationStatus,
  OrganizationRole,
} from "../../../generated/prisma/enums.js";
import { prisma } from "../../../prisma.js";
import { authHeader } from "../../../test-utils/auth.js";
import {
  createTestInvitation,
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

describe("organization invitation endpoints", () => {
  it("allows owners to invite admins or members, while admins can invite members only", async () => {
    const { organization, owner } = await createTestOrganization();
    const { user: admin } = await createTestMember({
      organizationId: organization.id,
      organizationRole: OrganizationRole.ADMIN,
    });

    const ownerInviteResponse = await request(app)
      .post(`/user/api/v1/organizations/${organization.id}/invitations`)
      .set("Authorization", authHeader(owner.id))
      .send({
        email: "new-admin@example.test",
        organizationRole: "ADMIN",
      });

    expect(ownerInviteResponse.status).toBe(201);
    expect(ownerInviteResponse.body.data.invitation.organizationRole).toBe("ADMIN");
    expect(ownerInviteResponse.body.data.invitation.token).toHaveLength(64);

    const adminInviteResponse = await request(app)
      .post(`/user/api/v1/organizations/${organization.id}/invitations`)
      .set("Authorization", authHeader(admin.id))
      .send({
        email: "admin-invites-member@example.test",
        organizationRole: "MEMBER",
      });

    expect(adminInviteResponse.status).toBe(201);

    const adminInviteAdminResponse = await request(app)
      .post(`/user/api/v1/organizations/${organization.id}/invitations`)
      .set("Authorization", authHeader(admin.id))
      .send({
        email: "admin-invites-admin@example.test",
        organizationRole: "ADMIN",
      });

    expect(adminInviteAdminResponse.status).toBe(403);
  });

  it("rejects invalid invitation input and duplicate invitations", async () => {
    const { organization, owner } = await createTestOrganization();

    const invalidEmailResponse = await request(app)
      .post(`/user/api/v1/organizations/${organization.id}/invitations`)
      .set("Authorization", authHeader(owner.id))
      .send({ email: "not-an-email", organizationRole: "MEMBER" });

    expect(invalidEmailResponse.status).toBe(400);

    const invalidRoleResponse = await request(app)
      .post(`/user/api/v1/organizations/${organization.id}/invitations`)
      .set("Authorization", authHeader(owner.id))
      .send({ email: "valid@example.test", organizationRole: "OWNER" });

    expect(invalidRoleResponse.status).toBe(400);

    await createTestInvitation({
      organizationId: organization.id,
      invitedBy: owner.id,
      email: "duplicate@example.test",
    });

    const duplicateResponse = await request(app)
      .post(`/user/api/v1/organizations/${organization.id}/invitations`)
      .set("Authorization", authHeader(owner.id))
      .send({ email: "duplicate@example.test", organizationRole: "MEMBER" });

    expect(duplicateResponse.status).toBe(409);
  });

  it("rejects inviting an existing active organization member", async () => {
    const { organization, owner } = await createTestOrganization();
    const { user } = await createTestMember({ organizationId: organization.id });

    const response = await request(app)
      .post(`/user/api/v1/organizations/${organization.id}/invitations`)
      .set("Authorization", authHeader(owner.id))
      .send({ email: user.email, organizationRole: "MEMBER" });

    expect(response.status).toBe(409);
  });

  it("sends invitation email through the mocked email service", async () => {
    const { organization, owner } = await createTestOrganization();
    const invitation = await createTestInvitation({
      organizationId: organization.id,
      invitedBy: owner.id,
      email: "email-target@example.test",
    });

    const response = await request(app)
      .post(
        `/user/api/v1/organizations/${organization.id}/invitations/${invitation.id}/send-email`,
      )
      .set("Authorization", authHeader(owner.id));

    expect(response.status).toBe(200);
    expect(mockedSendTemplateEmail).toHaveBeenCalledWith(
      "email-target@example.test",
      "App_Organization_Invitation",
      expect.objectContaining({
        organizationName: organization.name,
        organizationRole: "MEMBER",
        invitationLink: expect.stringContaining(`token=${invitation.token}`),
      }),
    );
  });

  it("validates pending tokens and rejects invalid, wrong-organization, expired, accepted, and revoked tokens", async () => {
    const { organization, owner } = await createTestOrganization();
    const other = await createTestOrganization();
    const validInvitation = await createTestInvitation({
      organizationId: organization.id,
      invitedBy: owner.id,
      email: "valid-token@example.test",
    });

    const validResponse = await request(app).get(
      `/user/api/v1/organizations/${organization.id}/invitations/validate/${validInvitation.token}`,
    );
    expect(validResponse.status).toBe(200);

    const invalidResponse = await request(app).get(
      `/user/api/v1/organizations/${organization.id}/invitations/validate/not-real`,
    );
    expect(invalidResponse.status).toBe(404);

    const wrongOrgResponse = await request(app).get(
      `/user/api/v1/organizations/${other.organization.id}/invitations/validate/${validInvitation.token}`,
    );
    expect(wrongOrgResponse.status).toBe(404);

    const expiredInvitation = await createTestInvitation({
      organizationId: organization.id,
      invitedBy: owner.id,
      expiresAt: new Date(Date.now() - 1000),
    });
    const expiredResponse = await request(app).get(
      `/user/api/v1/organizations/${organization.id}/invitations/validate/${expiredInvitation.token}`,
    );
    expect(expiredResponse.status).toBe(400);

    const acceptedInvitation = await createTestInvitation({
      organizationId: organization.id,
      invitedBy: owner.id,
      status: InvitationStatus.ACCEPTED,
    });
    const acceptedResponse = await request(app).get(
      `/user/api/v1/organizations/${organization.id}/invitations/validate/${acceptedInvitation.token}`,
    );
    expect(acceptedResponse.status).toBe(400);

    const revokedInvitation = await createTestInvitation({
      organizationId: organization.id,
      invitedBy: owner.id,
      status: InvitationStatus.REVOKED,
    });
    const revokedResponse = await request(app).get(
      `/user/api/v1/organizations/${organization.id}/invitations/validate/${revokedInvitation.token}`,
    );
    expect(revokedResponse.status).toBe(400);
  });

  it("accepts valid invitations and prevents token reuse or wrong-email acceptance", async () => {
    const { organization, owner } = await createTestOrganization();
    const invitedUser = await createTestUser({ email: "invited@example.test" });
    const wrongUser = await createTestUser({ email: "wrong@example.test" });
    const invitation = await createTestInvitation({
      organizationId: organization.id,
      invitedBy: owner.id,
      email: invitedUser.email!,
    });

    const wrongEmailResponse = await request(app)
      .post(`/user/api/v1/organizations/${organization.id}/invitations/accept`)
      .set("Authorization", authHeader(wrongUser.id))
      .send({ token: invitation.token });

    expect(wrongEmailResponse.status).toBe(403);

    const acceptResponse = await request(app)
      .post(`/user/api/v1/organizations/${organization.id}/invitations/accept`)
      .set("Authorization", authHeader(invitedUser.id))
      .send({ token: invitation.token });

    expect(acceptResponse.status).toBe(200);
    expect(acceptResponse.body.data.member.status).toBe("ACTIVE");
    expect(typeof acceptResponse.body.data.member.id).toBe("string");

    const savedInvitation = await prisma.organizationInvitation.findUnique({
      where: { id: invitation.id },
    });
    expect(savedInvitation?.status).toBe(InvitationStatus.ACCEPTED);

    const reuseResponse = await request(app)
      .post(`/user/api/v1/organizations/${organization.id}/invitations/accept`)
      .set("Authorization", authHeader(invitedUser.id))
      .send({ token: invitation.token });

    expect(reuseResponse.status).toBe(400);
  });

  it("revokes only pending invitations", async () => {
    const { organization, owner } = await createTestOrganization();
    const pendingInvitation = await createTestInvitation({
      organizationId: organization.id,
      invitedBy: owner.id,
    });
    const acceptedInvitation = await createTestInvitation({
      organizationId: organization.id,
      invitedBy: owner.id,
      status: InvitationStatus.ACCEPTED,
    });

    const revokeResponse = await request(app)
      .patch(
        `/user/api/v1/organizations/${organization.id}/invitations/${pendingInvitation.id}/revoke`,
      )
      .set("Authorization", authHeader(owner.id));

    expect(revokeResponse.status).toBe(200);
    expect(revokeResponse.body.data.invitation.status).toBe("REVOKED");

    const acceptedRevokeResponse = await request(app)
      .patch(
        `/user/api/v1/organizations/${organization.id}/invitations/${acceptedInvitation.id}/revoke`,
      )
      .set("Authorization", authHeader(owner.id));

    expect(acceptedRevokeResponse.status).toBe(400);
  });

  it("resends expired invitations with a new token and email", async () => {
    const { organization, owner } = await createTestOrganization();
    const invitation = await createTestInvitation({
      organizationId: organization.id,
      invitedBy: owner.id,
      status: InvitationStatus.EXPIRED,
    });

    const response = await request(app)
      .post(
        `/user/api/v1/organizations/${organization.id}/invitations/${invitation.id}/resend`,
      )
      .set("Authorization", authHeader(owner.id));

    expect(response.status).toBe(200);
    expect(response.body.data.invitation.status).toBe("PENDING");
    expect(response.body.data.invitation.token).not.toBe(invitation.token);
    expect(mockedSendTemplateEmail).toHaveBeenCalledTimes(1);
  });

  it("expires only pending old invitations", async () => {
    const { organization, owner } = await createTestOrganization();
    const expiredPending = await createTestInvitation({
      organizationId: organization.id,
      invitedBy: owner.id,
      expiresAt: new Date(Date.now() - 1000),
    });
    const expiredAccepted = await createTestInvitation({
      organizationId: organization.id,
      invitedBy: owner.id,
      status: InvitationStatus.ACCEPTED,
      expiresAt: new Date(Date.now() - 1000),
    });
    const activePending = await createTestInvitation({
      organizationId: organization.id,
      invitedBy: owner.id,
    });

    const response = await request(app)
      .patch(`/user/api/v1/organizations/${organization.id}/invitations/expire-old`)
      .set("Authorization", authHeader(owner.id));

    expect(response.status).toBe(200);
    expect(response.body.data.count).toBe(1);

    await expect(
      prisma.organizationInvitation.findUnique({ where: { id: expiredPending.id } }),
    ).resolves.toMatchObject({ status: InvitationStatus.EXPIRED });
    await expect(
      prisma.organizationInvitation.findUnique({ where: { id: expiredAccepted.id } }),
    ).resolves.toMatchObject({ status: InvitationStatus.ACCEPTED });
    await expect(
      prisma.organizationInvitation.findUnique({ where: { id: activePending.id } }),
    ).resolves.toMatchObject({ status: InvitationStatus.PENDING });
  });
});
