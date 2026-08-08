/// <reference types="jest" />
import { jest } from "@jest/globals";
import request from "supertest";
import { inventoryPrisma } from "../../prismaInventory.js";
import { authHeader } from "../../../test-utils/auth.js";
import {
  createTestOrganization,
  createTestUser,
} from "../../../test-utils/factories.js";
import {
  createTestProduct,
  createTestUnit,
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
  INVENTORY_CATALOG_READ,
  INVENTORY_UNITS_MANAGE,
} from "../../shared/inventory.middleware.js";
import { DEFAULT_UNITS } from "./unit.service.js";

await assertTestDatabaseReady();
await assertInventoryTestDatabaseReady();
jest.setTimeout(60000);

beforeEach(async () => {
  await truncateAllTestDatabases();
});

afterAll(async () => {
  await disconnectAllTestDatabases();
});

const unitsUrl = (organizationId: string) =>
  `/user/api/v1/organizations/${organizationId}/inventory/units`;

describe("inventory units", () => {
  it("seeds the defaults on the organization's first list, once", async () => {
    const { organization, owner } = await setupInventoryOrg();

    const first = await request(app)
      .get(unitsUrl(organization.id))
      .set("Authorization", authHeader(owner.id));

    expect(first.status).toBe(200);
    expect(first.body.data.pagination.total).toBe(DEFAULT_UNITS.length);
    expect(first.body.data.items.every((unit: any) => unit.isSystem)).toBe(
      true,
    );

    const second = await request(app)
      .get(unitsUrl(organization.id))
      .set("Authorization", authHeader(owner.id));

    expect(second.body.data.pagination.total).toBe(DEFAULT_UNITS.length);

    // The explicit re-run is idempotent too.
    const reseed = await request(app)
      .post(`${unitsUrl(organization.id)}/seed-defaults`)
      .set("Authorization", authHeader(owner.id));

    expect(reseed.status).toBe(200);
    expect(reseed.body.data.created).toBe(0);
  });

  it("creates, reads, updates and archives a unit", async () => {
    const { organization, owner } = await setupInventoryOrg();

    const created = await request(app)
      .post(unitsUrl(organization.id))
      .set("Authorization", authHeader(owner.id))
      .send({ name: "Sack", symbol: "sk" });

    expect(created.status).toBe(201);
    expect(created.body.data.unit).toMatchObject({
      name: "Sack",
      symbol: "sk",
      isSystem: false,
      deletedAt: null,
    });
    const unitId = created.body.data.unit.id;

    const fetched = await request(app)
      .get(`${unitsUrl(organization.id)}/${unitId}`)
      .set("Authorization", authHeader(owner.id));
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.unit.name).toBe("Sack");

    const updated = await request(app)
      .patch(`${unitsUrl(organization.id)}/${unitId}`)
      .set("Authorization", authHeader(owner.id))
      .send({ name: "Bag", symbol: "bg" });
    expect(updated.status).toBe(200);
    expect(updated.body.data.unit).toMatchObject({ name: "Bag", symbol: "bg" });

    const deleted = await request(app)
      .delete(`${unitsUrl(organization.id)}/${unitId}`)
      .set("Authorization", authHeader(owner.id));
    expect(deleted.status).toBe(200);
    expect(deleted.body.data.unit.deletedAt).not.toBeNull();

    const list = await request(app)
      .get(unitsUrl(organization.id))
      .set("Authorization", authHeader(owner.id));
    expect(list.body.data.items.some((unit: any) => unit.id === unitId)).toBe(
      false,
    );

    const archived = await request(app)
      .get(`${unitsUrl(organization.id)}?includeDeleted=true`)
      .set("Authorization", authHeader(owner.id));
    expect(
      archived.body.data.items.some((unit: any) => unit.id === unitId),
    ).toBe(true);

    const restored = await request(app)
      .post(`${unitsUrl(organization.id)}/${unitId}/restore`)
      .set("Authorization", authHeader(owner.id));
    expect(restored.status).toBe(200);
    expect(restored.body.data.unit.deletedAt).toBeNull();
  });

  it("rejects a duplicate name and blank input", async () => {
    const { organization, owner } = await setupInventoryOrg();

    await request(app)
      .post(unitsUrl(organization.id))
      .set("Authorization", authHeader(owner.id))
      .send({ name: "Crate", symbol: "cr" })
      .expect(201);

    const duplicate = await request(app)
      .post(unitsUrl(organization.id))
      .set("Authorization", authHeader(owner.id))
      .send({ name: "Crate", symbol: "crt" });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe("DUPLICATE");

    const blank = await request(app)
      .post(unitsUrl(organization.id))
      .set("Authorization", authHeader(owner.id))
      .send({ name: "   ", symbol: "x" });
    expect(blank.status).toBe(400);
  });

  it("refuses to delete a unit that is in use or seeded", async () => {
    const { organization, owner } = await setupInventoryOrg();

    const unit = await createTestUnit({ organizationId: organization.id });
    await createTestProduct({
      organizationId: organization.id,
      baseUnitId: unit.id,
    });

    const inUse = await request(app)
      .delete(`${unitsUrl(organization.id)}/${unit.id}`)
      .set("Authorization", authHeader(owner.id));
    expect(inUse.status).toBe(409);
    expect(inUse.body.code).toBe("IN_USE");

    const systemUnit = await createTestUnit({
      organizationId: organization.id,
      isSystem: true,
    });
    const systemDelete = await request(app)
      .delete(`${unitsUrl(organization.id)}/${systemUnit.id}`)
      .set("Authorization", authHeader(owner.id));
    expect(systemDelete.status).toBe(400);
  });

  it("400s a malformed id and 404s an unknown one", async () => {
    const { organization, owner } = await setupInventoryOrg();

    await request(app)
      .get(`${unitsUrl(organization.id)}/not-a-uuid`)
      .set("Authorization", authHeader(owner.id))
      .expect(400);

    await request(app)
      .get(`${unitsUrl(organization.id)}/11111111-1111-4111-8111-111111111111`)
      .set("Authorization", authHeader(owner.id))
      .expect(404);
  });

  it("gates writes on the app permission and reads on catalog read", async () => {
    const { organization, memberUser, grantMember } = await setupInventoryOrg();

    // No app role yet: no access to the app at all.
    await request(app)
      .get(unitsUrl(organization.id))
      .set("Authorization", authHeader(memberUser.id))
      .expect(403);

    await grantMember([INVENTORY_CATALOG_READ]);

    await request(app)
      .get(unitsUrl(organization.id))
      .set("Authorization", authHeader(memberUser.id))
      .expect(200);

    const write = await request(app)
      .post(unitsUrl(organization.id))
      .set("Authorization", authHeader(memberUser.id))
      .send({ name: "Pallet", symbol: "plt" });
    expect(write.status).toBe(403);
    expect(write.body.message).toContain(INVENTORY_UNITS_MANAGE);
  });

  it("lets a member write once the role carries the manage permission", async () => {
    const { organization, memberUser, grantMember } = await setupInventoryOrg();

    await grantMember([INVENTORY_CATALOG_READ, INVENTORY_UNITS_MANAGE]);

    await request(app)
      .post(unitsUrl(organization.id))
      .set("Authorization", authHeader(memberUser.id))
      .send({ name: "Pallet", symbol: "plt" })
      .expect(201);
  });

  it("keeps organizations apart", async () => {
    const { organization, owner } = await setupInventoryOrg();
    const outsider = await createTestUser();
    await createTestOrganization(outsider);

    const unit = await createTestUnit({ organizationId: organization.id });

    // A stranger cannot reach the org at all.
    await request(app)
      .get(`${unitsUrl(organization.id)}/${unit.id}`)
      .set("Authorization", authHeader(outsider.id))
      .expect(403);

    // And a unit from another tenant is simply not found from this one.
    const otherOrg = await setupInventoryOrg();
    const foreignUnit = await createTestUnit({
      organizationId: otherOrg.organization.id,
    });

    await request(app)
      .get(`${unitsUrl(organization.id)}/${foreignUnit.id}`)
      .set("Authorization", authHeader(owner.id))
      .expect(404);
  });

  it("requires authentication", async () => {
    const { organization } = await setupInventoryOrg();
    await request(app).get(unitsUrl(organization.id)).expect(401);
  });

  it("paginates and searches", async () => {
    const { organization, owner } = await setupInventoryOrg();

    // Seed explicitly: creating a unit first would mean the org is no longer
    // empty, so listing would not seed and there would be nothing to page.
    await request(app)
      .post(`${unitsUrl(organization.id)}/seed-defaults`)
      .set("Authorization", authHeader(owner.id))
      .expect(200);

    await createTestUnit({
      organizationId: organization.id,
      name: "Findable",
      symbol: "fnd",
    });

    const page = await request(app)
      .get(`${unitsUrl(organization.id)}?pageSize=2&page=1`)
      .set("Authorization", authHeader(owner.id));
    expect(page.status).toBe(200);
    expect(page.body.data.items).toHaveLength(2);
    expect(page.body.data.pagination.pageSize).toBe(2);
    expect(page.body.data.pagination.total).toBe(DEFAULT_UNITS.length + 1);

    const search = await request(app)
      .get(`${unitsUrl(organization.id)}?search=findab`)
      .set("Authorization", authHeader(owner.id));
    expect(search.body.data.items).toHaveLength(1);
    expect(search.body.data.items[0].name).toBe("Findable");

    const badPage = await request(app)
      .get(`${unitsUrl(organization.id)}?page=0`)
      .set("Authorization", authHeader(owner.id));
    expect(badPage.status).toBe(400);
  });

  it("refuses to delete a unit stamped on the ledger", async () => {
    const { organization, owner, defaultBranch } = await setupInventoryOrg();

    const unit = await createTestUnit({ organizationId: organization.id });
    const product = await createTestProduct({
      organizationId: organization.id,
      baseUnitId: unit.id,
    });
    const variant = await inventoryPrisma.productVariant.create({
      data: {
        organizationId: organization.id,
        productId: product.id,
        name: "Default",
        sku: `sku-${product.id}`,
        isDefault: true,
      },
    });
    const location = await inventoryPrisma.stockLocation.create({
      data: {
        organizationId: organization.id,
        branchId: defaultBranch.id,
        name: "Main",
        code: "MAIN",
        isDefault: true,
      },
    });
    await inventoryPrisma.inventoryMovement.create({
      data: {
        organizationId: organization.id,
        variantId: variant.id,
        locationId: location.id,
        branchId: defaultBranch.id,
        unitId: unit.id,
        type: "IN",
        quantity: 5,
        balanceAfter: 5,
        referenceType: "OPENING",
      },
    });

    // Archive the product so only the ledger reference remains.
    await inventoryPrisma.product.update({
      where: { id: product.id },
      data: { deletedAt: new Date() },
    });

    const response = await request(app)
      .delete(`${unitsUrl(organization.id)}/${unit.id}`)
      .set("Authorization", authHeader(owner.id));

    expect(response.status).toBe(409);
    expect(response.body.message).toContain("stock movements");
  });
});
