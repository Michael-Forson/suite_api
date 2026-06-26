/// <reference types="jest" />
import request from "supertest";
import { AuthProvider, Gender } from "../../../generated/prisma/enums.js";
import { prisma } from "../../../prisma.js";
import { authHeader } from "../../../test-utils/auth.js";
import {
  createTestOrganization,
  createTestUser,
} from "../../../test-utils/factories.js";
import { app, mockedSendTemplateEmail } from "../../../test-utils/testApp.js";
import {
  assertTestDatabaseReady,
  disconnectTestDatabase,
  truncateTestDatabase,
} from "../../../test-utils/testDb.js";
import { hashPassword } from "../../../utils/password.js";
import {
  UserOrgAccessClaim,
  verifyAccessToken,
} from "../../../utils/tokens.js";

await assertTestDatabaseReady();

beforeEach(async () => {
  mockedSendTemplateEmail.mockClear();
  await truncateTestDatabase();
});

afterAll(async () => {
  await disconnectTestDatabase();
});

describe("authentication endpoints", () => {
  it("registers a user with email and serializes BigInt ids as strings", async () => {
    const response = await request(app)
      .post("/user/api/v1/auth/register")
      .send({
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.test",
        password: "password123",
        gender: Gender.FEMALE,
        dob: "1990-01-01",
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.test",
      authProvider: AuthProvider.EMAIL,
      isActive: true,
    });
    expect(typeof response.body.data.id).toBe("string");
    expect(response.body.data.password).toBeUndefined();
  });

  it("rejects invalid registration input and duplicate identifiers", async () => {
    const invalidResponse = await request(app)
      .post("/user/api/v1/auth/register")
      .send({
        firstName: "Bad",
        lastName: "Email",
        email: "not-an-email",
        password: "password123",
      });

    expect(invalidResponse.status).toBe(400);

    await createTestUser({ email: "duplicate@example.test" });

    const duplicateResponse = await request(app)
      .post("/user/api/v1/auth/register")
      .send({
        firstName: "Dupe",
        lastName: "User",
        email: "duplicate@example.test",
        password: "password123",
      });

    expect(duplicateResponse.status).toBe(409);
  });

  it("logs in with valid credentials and rejects invalid credentials", async () => {
    const password = "password123";
    const user = await createTestUser({
      email: "login@example.test",
      password: await hashPassword(password),
    });

    const invalidResponse = await request(app)
      .post("/user/api/v1/auth/login")
      .send({ email: user.email, password: "wrong-password" });

    expect(invalidResponse.status).toBe(401);

    const response = await request(app)
      .post("/user/api/v1/auth/login")
      .send({ email: user.email, password });

    expect(response.status).toBe(200);
    expect(response.body.data.user.id).toBe(user.id.toString());
    expect(response.body.data.user.password).toBeUndefined();
    expect(response.body.data.tokens.accessToken).toEqual(expect.any(String));
    expect(response.body.data.tokens.refreshToken).toEqual(expect.any(String));
  });

  it("refreshes tokens from a valid refresh token", async () => {
    const password = "password123";
    const user = await createTestUser({
      email: "refresh@example.test",
      password: await hashPassword(password),
    });

    const loginResponse = await request(app)
      .post("/user/api/v1/auth/login")
      .send({ email: user.email, password });

    const response = await request(app)
      .post("/user/api/v1/auth/refresh-token")
      .send({
        refreshToken: loginResponse.body.data.tokens.refreshToken,
      });

    expect(response.status).toBe(200);
    expect(response.body.data.tokens.accessToken).toEqual(expect.any(String));
    expect(response.body.data.tokens.refreshToken).toEqual(expect.any(String));
  });

  it("rebuilds organization access claims when refreshing tokens", async () => {
    const password = "password123";
    const user = await createTestUser({
      email: "refresh-orgs@example.test",
      password: await hashPassword(password),
    });

    const loginResponse = await request(app)
      .post("/user/api/v1/auth/login")
      .send({ email: user.email, password });

    const initialClaims = verifyAccessToken(
      loginResponse.body.data.tokens.accessToken,
      "user",
    ) as { orgs?: UserOrgAccessClaim[] };
    expect(initialClaims.orgs).toEqual([]);

    const { organization, ownerMember } = await createTestOrganization(user);

    const refreshResponse = await request(app)
      .post("/user/api/v1/auth/refresh-token")
      .send({
        refreshToken: loginResponse.body.data.tokens.refreshToken,
      });

    expect(refreshResponse.status).toBe(200);
    const refreshedClaims = verifyAccessToken(
      refreshResponse.body.data.tokens.accessToken,
      "user",
    ) as { orgs?: UserOrgAccessClaim[] };

    expect(refreshedClaims.orgs).toContainEqual(
      expect.objectContaining({
        organizationId: organization.id.toString(),
        organizationMemberId: ownerMember.id.toString(),
        organizationRole: "OWNER",
        organizationStatus: "ACTIVE",
        memberStatus: "ACTIVE",
      }),
    );
  });

  it("returns and updates the authenticated user profile", async () => {
    const user = await createTestUser({
      firstName: "Before",
      lastName: "User",
      email: "profile@example.test",
    });

    const meResponse = await request(app)
      .get("/user/api/v1/auth/me")
      .set("Authorization", authHeader(user.id));

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.data.user.id).toBe(user.id.toString());

    const updateResponse = await request(app)
      .patch("/user/api/v1/auth/profile")
      .set("Authorization", authHeader(user.id))
      .send({
        firstName: "After",
        lastName: "Profile",
        gender: Gender.OTHER,
        dob: "1995-05-20",
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.data).toMatchObject({
      id: user.id.toString(),
      firstName: "After",
      lastName: "Profile",
      gender: Gender.OTHER,
    });
  });

  it("requires auth for protected routes and soft-deletes accounts", async () => {
    const user = await createTestUser({ email: "delete-me@example.test" });

    const unauthenticatedResponse = await request(app).get(
      "/user/api/v1/auth/me",
    );

    expect(unauthenticatedResponse.status).toBe(401);

    const deleteResponse = await request(app)
      .delete("/user/api/v1/auth/delete-account")
      .set("Authorization", authHeader(user.id));

    expect(deleteResponse.status).toBe(200);

    const deletedUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(deletedUser?.isActive).toBe(false);
    expect(deletedUser?.deletedAt).toBeInstanceOf(Date);
    expect(deletedUser?.email).toBeNull();
  });
});
