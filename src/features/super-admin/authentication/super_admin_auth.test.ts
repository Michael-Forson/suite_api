/// <reference types="jest" />
import request from "supertest";
import {
  SuperAdminStatus,
} from "../../../generated/prisma/enums.js";
import {
  superAdminAuthHeader,
  authHeader,
} from "../../../test-utils/auth.js";
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
import { generateRefreshToken } from "../../../utils/tokens.js";

await assertTestDatabaseReady();

beforeEach(async () => {
  mockedSendTemplateEmail.mockClear();
  await truncateTestDatabase();
});

afterAll(async () => {
  await disconnectTestDatabase();
});

describe("super-admin authentication", () => {
  it("logs in, refreshes tokens, and returns the current profile", async () => {
    const superAdmin = await createTestSuperAdmin({
      email: "super-admin@example.test",
      firstName: "Ada",
    });

    const loginResponse = await request(app)
      .post("/super-admin/api/v1/auth/login")
      .send({ email: superAdmin.email, password: "Password123!" });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.data.superAdmin).toMatchObject({
      email: superAdmin.email,
      firstName: "Ada",
    });
    expect(loginResponse.body.data.tokens.accessToken).toEqual(expect.any(String));
    expect(loginResponse.body.data.tokens.refreshToken).toEqual(expect.any(String));

    const refreshResponse = await request(app)
      .post("/super-admin/api/v1/auth/refresh")
      .send({ refreshToken: loginResponse.body.data.tokens.refreshToken });
    expect(refreshResponse.status).toBe(200);

    const meResponse = await request(app)
      .get("/super-admin/api/v1/auth/me")
      .set(
        "Authorization",
        `Bearer ${refreshResponse.body.data.tokens.accessToken}`,
      );
    expect(meResponse.status).toBe(200);
    expect(meResponse.body.data.superAdmin.email).toBe(superAdmin.email);
  });

  it("rejects invalid credentials, disabled accounts, and user JWTs", async () => {
    const superAdmin = await createTestSuperAdmin({
      email: "disabled@example.test",
    });
    const user = await createTestUser();

    const invalidResponse = await request(app)
      .post("/super-admin/api/v1/auth/login")
      .send({ email: superAdmin.email, password: "wrong-password" });
    expect(invalidResponse.status).toBe(401);

    const userTokenResponse = await request(app)
      .get("/super-admin/api/v1/auth/me")
      .set("Authorization", authHeader(user.id));
    expect(userTokenResponse.status).toBe(401);

    const disabled = await createTestSuperAdmin({
      email: "inactive@example.test",
      status: SuperAdminStatus.DISABLED,
    });
    const disabledResponse = await request(app)
      .get("/super-admin/api/v1/auth/me")
      .set(
        "Authorization",
        superAdminAuthHeader(disabled.id),
      );
    expect(disabledResponse.status).toBe(403);

    const disabledRefreshResponse = await request(app)
      .post("/super-admin/api/v1/auth/refresh")
      .send({
        refreshToken: generateRefreshToken(disabled.id, "super-admin"),
      });
    expect(disabledRefreshResponse.status).toBe(403);
  });
});
