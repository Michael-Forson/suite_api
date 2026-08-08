/// <reference types="jest" />
import request from "supertest";
import { SuperAdminStatus } from "../../generated/prisma/enums.js";
import { superAdminAuthHeader } from "../../../test-utils/auth.js";
import { createTestSuperAdmin } from "../../../test-utils/factories.js";
import { app, mockedSendTemplateEmail } from "../../../test-utils/testApp.js";
import {
  assertTestDatabaseReady,
  disconnectTestDatabase,
  truncateTestDatabase,
} from "../../../test-utils/testDb.js";

await assertTestDatabaseReady();

/**
 * Managing other super-admins is the root account's alone —
 * `requireRootSuperAdmin` rejects everyone else with a 403 — so the acting
 * admin in these cases has to *be* root.
 *
 * Root-ness is an email match against `SUPER_ADMIN_EMAIL`, read at call time
 * precisely so a test can name it rather than depend on whatever the
 * deployment's `.env` happens to hold. The original value is restored
 * afterwards: suites share one process under `--runInBand`, and a leaked env
 * var would silently make some later suite's admin root.
 */
const ROOT_EMAIL = "root-super-admin@example.test";
const originalRootEmail = process.env.SUPER_ADMIN_EMAIL;

const createRootSuperAdmin = () => createTestSuperAdmin({ email: ROOT_EMAIL });

beforeAll(() => {
  process.env.SUPER_ADMIN_EMAIL = ROOT_EMAIL;
});

beforeEach(async () => {
  mockedSendTemplateEmail.mockClear();
  await truncateTestDatabase();
});

afterAll(async () => {
  if (originalRootEmail === undefined) delete process.env.SUPER_ADMIN_EMAIL;
  else process.env.SUPER_ADMIN_EMAIL = originalRootEmail;
  await disconnectTestDatabase();
});

describe("super-admin account management", () => {
  it("creates, updates, lists, and disables super-admin accounts", async () => {
    const currentSuperAdmin = await createRootSuperAdmin();

    // Creation is an invitation: no password is accepted here, and the account
    // lands as INVITED until it sets one through the emailed link.
    const createResponse = await request(app)
      .post("/super-admin/api/v1/accounts")
      .set("Authorization", superAdminAuthHeader(currentSuperAdmin.id))
      .send({
        firstName: "Grace",
        lastName: "Hopper",
        email: "grace@example.test",
      });
    expect(createResponse.status).toBe(201);
    expect(createResponse.body.data.superAdmin.status).toBe(
      SuperAdminStatus.INVITED,
    );
    const invitedSuperAdminId = createResponse.body.data.superAdmin.id;

    const updateResponse = await request(app)
      .patch(`/super-admin/api/v1/accounts/${invitedSuperAdminId}`)
      .set("Authorization", superAdminAuthHeader(currentSuperAdmin.id))
      .send({ firstName: "Amazing Grace" });
    expect(updateResponse.status).toBe(200);

    // An invited account has no password, so flipping its status would produce
    // an account nothing can sign into. It leaves INVITED by accepting, only.
    const invitedStatusResponse = await request(app)
      .patch(`/super-admin/api/v1/accounts/${invitedSuperAdminId}/status`)
      .set("Authorization", superAdminAuthHeader(currentSuperAdmin.id))
      .send({ status: SuperAdminStatus.DISABLED });
    expect(invitedStatusResponse.status).toBe(409);

    // An account that has accepted can be disabled.
    const activeSuperAdmin = await createTestSuperAdmin();
    const statusResponse = await request(app)
      .patch(`/super-admin/api/v1/accounts/${activeSuperAdmin.id}/status`)
      .set("Authorization", superAdminAuthHeader(currentSuperAdmin.id))
      .send({ status: SuperAdminStatus.DISABLED });
    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.data.superAdmin.status).toBe(
      SuperAdminStatus.DISABLED,
    );

    const listResponse = await request(app)
      .get("/super-admin/api/v1/accounts")
      .set("Authorization", superAdminAuthHeader(currentSuperAdmin.id));
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data.superAdmins).toHaveLength(3);
  });

  it("prevents a super-admin from disabling its own account", async () => {
    const superAdmin = await createRootSuperAdmin();

    const response = await request(app)
      .patch(`/super-admin/api/v1/accounts/${superAdmin.id}/status`)
      .set("Authorization", superAdminAuthHeader(superAdmin.id))
      .send({ status: SuperAdminStatus.DISABLED });

    expect(response.status).toBe(409);
  });

  it("validates privileged account input and password changes", async () => {
    const currentSuperAdmin = await createRootSuperAdmin();
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
