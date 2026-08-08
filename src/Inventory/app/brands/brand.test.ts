/// <reference types="jest" />
import { jest } from "@jest/globals";
import request from "supertest";
import { authHeader } from "../../../test-utils/auth.js";
import {
  createTestBrand,
  createTestProduct,
  setupInventoryOrg,
} from "../../../test-utils/inventoryFactories.js";
import { app } from "../../../test-utils/testApp.js";
import {
  assertInventoryTestDatabaseReady,
  assertTestDatabaseReady,
  disconnectAllTestDatabases,
  truncateAllTestDatabases,
} from "../../../test-utils/testDb.js";
import {
  INVENTORY_BRANDS_MANAGE,
  INVENTORY_CATALOG_READ,
} from "../../shared/inventory.middleware.js";

await assertTestDatabaseReady();
await assertInventoryTestDatabaseReady();
jest.setTimeout(60000);

beforeEach(async () => {
  await truncateAllTestDatabases();
});

afterAll(async () => {
  await disconnectAllTestDatabases();
});

const brandsUrl = (organizationId: string) =>
  `/user/api/v1/organizations/${organizationId}/inventory/brands`;

describe("inventory brands", () => {
  it("creates, reads, updates, archives and restores a brand", async () => {
    const { organization, owner } = await setupInventoryOrg();
    const url = brandsUrl(organization.id);

    const created = await request(app)
      .post(url)
      .set("Authorization", authHeader(owner.id))
      .send({ name: "Acme" });
    expect(created.status).toBe(201);
    const brandId = created.body.data.brand.id;

    const fetched = await request(app)
      .get(`${url}/${brandId}`)
      .set("Authorization", authHeader(owner.id));
    expect(fetched.body.data.brand.name).toBe("Acme");

    const updated = await request(app)
      .patch(`${url}/${brandId}`)
      .set("Authorization", authHeader(owner.id))
      .send({ name: "Acme Corp" });
    expect(updated.body.data.brand.name).toBe("Acme Corp");

    await request(app)
      .delete(`${url}/${brandId}`)
      .set("Authorization", authHeader(owner.id))
      .expect(200);

    const list = await request(app)
      .get(url)
      .set("Authorization", authHeader(owner.id));
    expect(list.body.data.items).toHaveLength(0);

    const restored = await request(app)
      .post(`${url}/${brandId}/restore`)
      .set("Authorization", authHeader(owner.id));
    expect(restored.status).toBe(200);
    expect(restored.body.data.brand.deletedAt).toBeNull();
  });

  it("rejects a duplicate name case-insensitively", async () => {
    const { organization, owner } = await setupInventoryOrg();
    const url = brandsUrl(organization.id);

    await createTestBrand({ organizationId: organization.id, name: "Nestle" });

    const clash = await request(app)
      .post(url)
      .set("Authorization", authHeader(owner.id))
      .send({ name: "nestle" });
    expect(clash.status).toBe(409);
    expect(clash.body.code).toBe("DUPLICATE");

    // An archived brand does not hold its name — that is the whole reason the
    // check lives here rather than in a unique index.
    const archived = await createTestBrand({
      organizationId: organization.id,
      name: "Retired",
    });
    await request(app)
      .delete(`${url}/${archived.id}`)
      .set("Authorization", authHeader(owner.id))
      .expect(200);

    await request(app)
      .post(url)
      .set("Authorization", authHeader(owner.id))
      .send({ name: "Retired" })
      .expect(201);

    // …and restoring the archived one now clashes with its replacement.
    const restore = await request(app)
      .post(`${url}/${archived.id}/restore`)
      .set("Authorization", authHeader(owner.id));
    expect(restore.status).toBe(409);
  });

  it("refuses to delete a brand that products still carry", async () => {
    const { organization, owner } = await setupInventoryOrg();

    const brand = await createTestBrand({ organizationId: organization.id });
    await createTestProduct({
      organizationId: organization.id,
      brandId: brand.id,
    });

    const response = await request(app)
      .delete(`${brandsUrl(organization.id)}/${brand.id}`)
      .set("Authorization", authHeader(owner.id));

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("IN_USE");
  });

  it("validates input and ids", async () => {
    const { organization, owner } = await setupInventoryOrg();
    const url = brandsUrl(organization.id);

    await request(app)
      .post(url)
      .set("Authorization", authHeader(owner.id))
      .send({ name: "" })
      .expect(400);

    await request(app)
      .post(url)
      .set("Authorization", authHeader(owner.id))
      .send({ name: "x".repeat(151) })
      .expect(400);

    await request(app)
      .get(`${url}/nonsense`)
      .set("Authorization", authHeader(owner.id))
      .expect(400);

    await request(app)
      .get(`${url}/11111111-1111-4111-8111-111111111111`)
      .set("Authorization", authHeader(owner.id))
      .expect(404);

    const brand = await createTestBrand({ organizationId: organization.id });
    await request(app)
      .patch(`${url}/${brand.id}`)
      .set("Authorization", authHeader(owner.id))
      .send({})
      .expect(400);
  });

  it("gates writes on the brands permission and keeps tenants apart", async () => {
    const { organization, memberUser, grantMember } = await setupInventoryOrg();
    const other = await setupInventoryOrg();
    const url = brandsUrl(organization.id);

    await grantMember([INVENTORY_CATALOG_READ]);
    await request(app)
      .get(url)
      .set("Authorization", authHeader(memberUser.id))
      .expect(200);

    const denied = await request(app)
      .post(url)
      .set("Authorization", authHeader(memberUser.id))
      .send({ name: "Nope" });
    expect(denied.status).toBe(403);
    expect(denied.body.message).toContain(INVENTORY_BRANDS_MANAGE);

    await grantMember([INVENTORY_CATALOG_READ, INVENTORY_BRANDS_MANAGE]);
    await request(app)
      .post(url)
      .set("Authorization", authHeader(memberUser.id))
      .send({ name: "Allowed" })
      .expect(201);

    // Another organization's brand is invisible from here.
    const foreign = await createTestBrand({
      organizationId: other.organization.id,
    });
    await request(app)
      .get(`${url}/${foreign.id}`)
      .set("Authorization", authHeader(memberUser.id))
      .expect(404);
  });
});
