import { prisma } from "../core/prisma.js";
import { inventoryPrisma } from "../Inventory/prismaInventory.js";
import {
  INVENTORY_APP_KEY,
  INVENTORY_BRANDS_MANAGE,
  INVENTORY_CATALOG_READ,
  INVENTORY_CATEGORIES_MANAGE,
  INVENTORY_UNITS_MANAGE,
} from "../Inventory/shared/inventory.middleware.js";
import {
  assignTestAppRole,
  createTestApp,
  createTestAppRole,
  createTestMember,
  createTestOrganization,
  createTestOrganizationApp,
  createTestPermission,
} from "./factories.js";

/**
 * Fixtures for the inventory app.
 *
 * Kept apart from `factories.ts` because they write a different database — the
 * two clients cannot share a transaction, and mixing them in one file makes it
 * easy to forget which one a helper touches.
 */

let sequence = 0;
const nextName = (prefix: string) => {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
};

export const INVENTORY_PERMISSION_KEYS = [
  INVENTORY_CATALOG_READ,
  INVENTORY_UNITS_MANAGE,
  INVENTORY_CATEGORIES_MANAGE,
  INVENTORY_BRANDS_MANAGE,
] as const;

/**
 * An organization with the inventory app enabled and its permissions defined.
 *
 * Reproduces what a real deployment reaches through the super-admin RBAC
 * endpoints: the app exists, the org has active access to it, and the four
 * catalog permissions are on record. Owners bypass permission checks
 * (`app_access.service.ts`), so `owner` can call anything; `member` starts with
 * no app role and therefore no access at all.
 */
export async function setupInventoryOrg() {
  const { organization, owner, ownerMember, defaultBranch } =
    await createTestOrganization();

  // `App.key` is globally unique and `AppPermission` is unique per (app, key),
  // so a test that sets up a *second* organization must reuse the one inventory
  // app row rather than create another. Both of these are therefore find-or-
  // create, not create.
  const existingApp = await prisma.app.findUnique({
    where: { key: INVENTORY_APP_KEY },
  });
  const appRecord =
    existingApp ??
    (await createTestApp({ key: INVENTORY_APP_KEY, name: "Inventory" }));

  await createTestOrganizationApp({
    organizationId: organization.id,
    app: appRecord,
    enabledBy: owner.id,
  });

  const permissions = await Promise.all(
    INVENTORY_PERMISSION_KEYS.map(async (key) => {
      const existing = await prisma.appPermission.findUnique({
        where: { appId_key: { appId: appRecord.id, key } },
      });
      return (
        existing ??
        (await createTestPermission({ appId: appRecord.id, key, label: key }))
      );
    }),
  );

  const permissionIdsByKey = new Map(
    permissions.map((permission) => [permission.key, permission.id]),
  );

  const { user: memberUser, member } = await createTestMember({
    organizationId: organization.id,
  });

  /**
   * Gives the plain member an app role carrying exactly these permissions.
   * Re-callable: a member holds one role per app (`@@unique`), so a second call
   * replaces the first rather than failing — which is what lets a test widen
   * access mid-way and assert on the change.
   */
  const grantMember = async (keys: readonly string[]) => {
    const role = await createTestAppRole({
      appId: appRecord.id,
      // Unique per call: `AppRole` is unique on (appId, name), and a test that
      // widens a member's access calls this more than once.
      name: nextName("Inventory Role"),
      appPermissionIds: keys
        .map((key) => permissionIdsByKey.get(key))
        .filter((id): id is string => Boolean(id)),
    });

    const existing = await prisma.memberAppRole.findUnique({
      where: {
        organizationMemberId_appId: {
          organizationMemberId: member.id,
          appId: appRecord.id,
        },
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.memberAppRole.update({
        where: { id: existing.id },
        data: { appRoleId: role.id },
      });
    } else {
      await assignTestAppRole({
        organizationMemberId: member.id,
        appId: appRecord.id,
        appRoleId: role.id,
      });
    }

    return role;
  };

  return {
    organization,
    owner,
    ownerMember,
    defaultBranch,
    appRecord,
    permissions,
    permissionIdsByKey,
    memberUser,
    member,
    grantMember,
  };
}

export async function createTestUnit({
  organizationId,
  name = nextName("Unit"),
  symbol = nextName("u").slice(0, 20),
  isSystem = false,
}: {
  organizationId: string;
  name?: string;
  symbol?: string;
  isSystem?: boolean;
}) {
  return inventoryPrisma.unit.create({
    data: { organizationId, name, symbol, isSystem },
  });
}

export async function createTestCategory({
  organizationId,
  name = nextName("Category"),
  parentCategoryId = null,
}: {
  organizationId: string;
  name?: string;
  parentCategoryId?: string | null;
}) {
  return inventoryPrisma.category.create({
    data: { organizationId, name, parentCategoryId },
  });
}

export async function createTestBrand({
  organizationId,
  name = nextName("Brand"),
}: {
  organizationId: string;
  name?: string;
}) {
  return inventoryPrisma.brand.create({
    data: { organizationId, name },
  });
}

/**
 * A product needs a category and a base unit — both required by the schema —
 * so this creates whichever was not supplied. Mostly used to prove the
 * delete-in-use guards fire.
 */
export async function createTestProduct({
  organizationId,
  name = nextName("Product"),
  categoryId,
  baseUnitId,
  brandId = null,
}: {
  organizationId: string;
  name?: string;
  categoryId?: string;
  baseUnitId?: string;
  brandId?: string | null;
}) {
  const category =
    categoryId ?? (await createTestCategory({ organizationId })).id;
  const baseUnit =
    baseUnitId ?? (await createTestUnit({ organizationId })).id;

  return inventoryPrisma.product.create({
    data: {
      organizationId,
      name,
      categoryId: category,
      baseUnitId: baseUnit,
      brandId,
    },
  });
}
