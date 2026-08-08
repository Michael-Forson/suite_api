/// <reference types="jest" />
import { jest } from "@jest/globals";
import request from "supertest";
import { authHeader } from "../../../test-utils/auth.js";
import {
  createTestCategory,
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
  INVENTORY_CATALOG_READ,
  INVENTORY_CATEGORIES_MANAGE,
} from "../../shared/inventory.middleware.js";
import { MAX_CATEGORY_DEPTH } from "./category.service.js";

await assertTestDatabaseReady();
await assertInventoryTestDatabaseReady();
jest.setTimeout(60000);

beforeEach(async () => {
  await truncateAllTestDatabases();
});

afterAll(async () => {
  await disconnectAllTestDatabases();
});

const categoriesUrl = (organizationId: string) =>
  `/user/api/v1/organizations/${organizationId}/inventory/categories`;

describe("inventory categories", () => {
  it("creates a nested category and returns the tree", async () => {
    const { organization, owner } = await setupInventoryOrg();
    const url = categoriesUrl(organization.id);

    const root = await request(app)
      .post(url)
      .set("Authorization", authHeader(owner.id))
      .send({ name: "Grocery" });
    expect(root.status).toBe(201);
    expect(root.body.data.category.parentCategoryId).toBeNull();

    const child = await request(app)
      .post(url)
      .set("Authorization", authHeader(owner.id))
      .send({
        name: "Beverages",
        parentCategoryId: root.body.data.category.id,
      });
    expect(child.status).toBe(201);
    expect(child.body.data.category.parentCategoryId).toBe(
      root.body.data.category.id,
    );

    const tree = await request(app)
      .get(`${url}/tree`)
      .set("Authorization", authHeader(owner.id));
    expect(tree.status).toBe(200);
    expect(tree.body.data.tree).toHaveLength(1);
    expect(tree.body.data.tree[0]).toMatchObject({ name: "Grocery", depth: 1 });
    expect(tree.body.data.tree[0].children).toHaveLength(1);
    expect(tree.body.data.tree[0].children[0]).toMatchObject({
      name: "Beverages",
      depth: 2,
    });
  });

  it("enforces sibling name uniqueness case-insensitively, but allows the same name under different parents", async () => {
    const { organization, owner } = await setupInventoryOrg();
    const url = categoriesUrl(organization.id);

    const a = await createTestCategory({
      organizationId: organization.id,
      name: "Drinks",
    });
    const b = await createTestCategory({
      organizationId: organization.id,
      name: "Food",
    });

    const clash = await request(app)
      .post(url)
      .set("Authorization", authHeader(owner.id))
      .send({ name: "drinks" });
    expect(clash.status).toBe(409);
    expect(clash.body.code).toBe("DUPLICATE");

    // "Cans" under each of two different parents is fine.
    await request(app)
      .post(url)
      .set("Authorization", authHeader(owner.id))
      .send({ name: "Cans", parentCategoryId: a.id })
      .expect(201);
    await request(app)
      .post(url)
      .set("Authorization", authHeader(owner.id))
      .send({ name: "Cans", parentCategoryId: b.id })
      .expect(201);
  });

  it("rejects a move that would create a cycle", async () => {
    const { organization, owner } = await setupInventoryOrg();
    const url = categoriesUrl(organization.id);

    const root = await createTestCategory({ organizationId: organization.id });
    const child = await createTestCategory({
      organizationId: organization.id,
      parentCategoryId: root.id,
    });
    const grandchild = await createTestCategory({
      organizationId: organization.id,
      parentCategoryId: child.id,
    });

    const selfParent = await request(app)
      .patch(`${url}/${root.id}/parent`)
      .set("Authorization", authHeader(owner.id))
      .send({ parentCategoryId: root.id });
    expect(selfParent.status).toBe(400);

    const cycle = await request(app)
      .patch(`${url}/${root.id}/parent`)
      .set("Authorization", authHeader(owner.id))
      .send({ parentCategoryId: grandchild.id });
    expect(cycle.status).toBe(400);
    expect(cycle.body.message).toContain("descendants");

    // A legitimate move still works, and to the root too.
    await request(app)
      .patch(`${url}/${grandchild.id}/parent`)
      .set("Authorization", authHeader(owner.id))
      .send({ parentCategoryId: root.id })
      .expect(200);

    const toRoot = await request(app)
      .patch(`${url}/${grandchild.id}/parent`)
      .set("Authorization", authHeader(owner.id))
      .send({ parentCategoryId: null });
    expect(toRoot.status).toBe(200);
    expect(toRoot.body.data.category.parentCategoryId).toBeNull();

    // The key must be present — omitting it is ambiguous, not "move to root".
    await request(app)
      .patch(`${url}/${grandchild.id}/parent`)
      .set("Authorization", authHeader(owner.id))
      .send({})
      .expect(400);
  });

  it("caps nesting depth", async () => {
    const { organization, owner } = await setupInventoryOrg();
    const url = categoriesUrl(organization.id);

    let parentId: string | null = null;
    for (let level = 0; level < MAX_CATEGORY_DEPTH; level += 1) {
      const response = await request(app)
        .post(url)
        .set("Authorization", authHeader(owner.id))
        .send({ name: `Level ${level}`, parentCategoryId: parentId });
      expect(response.status).toBe(201);
      parentId = response.body.data.category.id;
    }

    const tooDeep = await request(app)
      .post(url)
      .set("Authorization", authHeader(owner.id))
      .send({ name: "One too many", parentCategoryId: parentId });
    expect(tooDeep.status).toBe(400);
    expect(tooDeep.body.message).toContain(String(MAX_CATEGORY_DEPTH));
  });

  it("refuses to delete a category with children or products", async () => {
    const { organization, owner } = await setupInventoryOrg();
    const url = categoriesUrl(organization.id);

    const parent = await createTestCategory({
      organizationId: organization.id,
    });
    const child = await createTestCategory({
      organizationId: organization.id,
      parentCategoryId: parent.id,
    });

    const withChildren = await request(app)
      .delete(`${url}/${parent.id}`)
      .set("Authorization", authHeader(owner.id));
    expect(withChildren.status).toBe(409);
    expect(withChildren.body.code).toBe("IN_USE");

    await createTestProduct({
      organizationId: organization.id,
      categoryId: child.id,
    });
    const withProducts = await request(app)
      .delete(`${url}/${child.id}`)
      .set("Authorization", authHeader(owner.id));
    expect(withProducts.status).toBe(409);
  });

  it("archives and restores an empty category", async () => {
    const { organization, owner } = await setupInventoryOrg();
    const url = categoriesUrl(organization.id);

    const category = await createTestCategory({
      organizationId: organization.id,
      name: "Seasonal",
    });

    const deleted = await request(app)
      .delete(`${url}/${category.id}`)
      .set("Authorization", authHeader(owner.id));
    expect(deleted.status).toBe(200);

    const list = await request(app)
      .get(url)
      .set("Authorization", authHeader(owner.id));
    expect(list.body.data.items).toHaveLength(0);

    const tree = await request(app)
      .get(`${url}/tree`)
      .set("Authorization", authHeader(owner.id));
    expect(tree.body.data.tree).toHaveLength(0);

    const restored = await request(app)
      .post(`${url}/${category.id}/restore`)
      .set("Authorization", authHeader(owner.id));
    expect(restored.status).toBe(200);
    expect(restored.body.data.category.deletedAt).toBeNull();

    const secondRestore = await request(app)
      .post(`${url}/${category.id}/restore`)
      .set("Authorization", authHeader(owner.id));
    expect(secondRestore.status).toBe(400);
  });

  it("restores an orphan to the root when its parent is still archived", async () => {
    const { organization, owner } = await setupInventoryOrg();
    const url = categoriesUrl(organization.id);

    const parent = await createTestCategory({
      organizationId: organization.id,
    });
    const child = await createTestCategory({
      organizationId: organization.id,
      parentCategoryId: parent.id,
    });

    await request(app)
      .delete(`${url}/${child.id}`)
      .set("Authorization", authHeader(owner.id))
      .expect(200);
    await request(app)
      .delete(`${url}/${parent.id}`)
      .set("Authorization", authHeader(owner.id))
      .expect(200);

    const restored = await request(app)
      .post(`${url}/${child.id}/restore`)
      .set("Authorization", authHeader(owner.id));
    expect(restored.status).toBe(200);
    expect(restored.body.data.category.parentCategoryId).toBeNull();
  });

  it("rejects a parent from another organization", async () => {
    const { organization, owner } = await setupInventoryOrg();
    const other = await setupInventoryOrg();

    const foreignParent = await createTestCategory({
      organizationId: other.organization.id,
    });

    const response = await request(app)
      .post(categoriesUrl(organization.id))
      .set("Authorization", authHeader(owner.id))
      .send({ name: "Smuggled", parentCategoryId: foreignParent.id });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain("Parent category not found");
  });

  it("gates writes on the categories permission", async () => {
    const { organization, memberUser, grantMember } = await setupInventoryOrg();
    const url = categoriesUrl(organization.id);

    await grantMember([INVENTORY_CATALOG_READ]);

    await request(app)
      .get(url)
      .set("Authorization", authHeader(memberUser.id))
      .expect(200);

    const write = await request(app)
      .post(url)
      .set("Authorization", authHeader(memberUser.id))
      .send({ name: "Nope" });
    expect(write.status).toBe(403);
    expect(write.body.message).toContain(INVENTORY_CATEGORIES_MANAGE);
  });

  it("filters to root categories and by parent", async () => {
    const { organization, owner } = await setupInventoryOrg();
    const url = categoriesUrl(organization.id);

    const root = await createTestCategory({ organizationId: organization.id });
    await createTestCategory({
      organizationId: organization.id,
      parentCategoryId: root.id,
    });

    const rootOnly = await request(app)
      .get(`${url}?rootOnly=true`)
      .set("Authorization", authHeader(owner.id));
    expect(rootOnly.body.data.items).toHaveLength(1);

    const byParent = await request(app)
      .get(`${url}?parentCategoryId=${root.id}`)
      .set("Authorization", authHeader(owner.id));
    expect(byParent.body.data.items).toHaveLength(1);
    expect(byParent.body.data.items[0].parentCategoryId).toBe(root.id);
  });
});
