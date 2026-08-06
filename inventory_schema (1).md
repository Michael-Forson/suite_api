# Inventory App — Database Schema

Part of a larger suite (Zoho/Odoo style). Users, organizations, and staff live in
the **core database**. This is the **inventory app's own database**.

## Design principles

- **Inventory is keyed by variant, not product.** Every product has at least one
  variant. A "simple" product has a single default variant that carries its
  SKU/barcode/prices. All stock — on-hand, movements, adjustment lines, transfer
  lines — references `variantId`, never `productId`.
- **Cross-DB references are logical, not foreign keys.** `organizationId`,
  `createdBy`, `approvedBy`, and doc `referenceId`s point at the core DB (or other
  apps). They are indexed ID columns with **no FK constraints** — you can't FK
  across databases.
- **The ledger is the source of truth.** `InventoryMovement` is append-only and
  immutable. `Inventory.quantity` is a cache derived from summing movements; both
  are written in the same transaction. Corrections are new reversing rows, never
  edits.
- **Units are seeded per org.** Each org gets its own copy of the default unit set
  and can rename, delete, or add its own. `isSystem` marks the seeded ones.
- **Branch is the canonical internal name; its label is configurable per org.** The
  schema always calls the stocking place a `Branch` (developer-facing handle). What
  users *see* — "Branch", "Store", "Warehouse", "Location", or custom — is a per-org
  display label stored in `InventorySettings`. The term is data, never schema.
- **Soft deletes everywhere** in catalog/branch tables (`deletedAt`). Nothing
  referenced by a movement is ever hard-deleted.
- **Money** is stored as decimal or integer minor units — never float. Currency is
  inherited from the organization in the core DB (no local currency column unless
  multi-currency inventory becomes a real requirement).

---

## Org-level settings

### InventorySettings
One row per org (singleton). Natural home for app-level defaults over time.
| column | notes |
|---|---|
| id | |
| organizationId | unique — one per org |
| locationLabelSingular | "Branch", "Store", "Warehouse", "Location"... |
| locationLabelPlural | "Branches", "Stores"... |
| createdAt, updatedAt | |

- The UI reads these labels everywhere the branch entity is shown; the database
  schema never changes regardless of the term chosen.
- Alternatively this label could live in the core DB with other org settings — but
  keeping it in the inventory DB keeps the concern local.

---

## Catalog

### Unit
| column | notes |
|---|---|
| id | |
| organizationId | logical ref → core DB; always set (seeded per org) |
| name | "Each", "Box", "Kilogram", "pcs" |
| symbol | "ea", "box", "kg" |
| isSystem | true = seeded default; false = org-created |
| createdAt, updatedAt, deletedAt | |

- unique `(organizationId, name)`
- No conversion model. If "buy in box of 12, stock in each" is ever needed, add
  `baseUnitId` (self-ref) + `factor` here later — it doesn't touch the ledger, so
  it's a safe future add.

### Category
| column | notes |
|---|---|
| id | |
| organizationId | |
| parentCategoryId | self-ref, nullable (tree) |
| name | |
| createdAt, updatedAt, deletedAt | |

### Brand
| column | notes |
|---|---|
| id | |
| organizationId | |
| name | |
| createdAt, updatedAt, deletedAt | |

### Attribute
The **axis** of variation: "Color", "Size".
| column | notes |
|---|---|
| id | |
| organizationId | |
| name | |
| createdAt, updatedAt, deletedAt | |

### AttributeValue
A **point** on the axis: "Red", "Large".
| column | notes |
|---|---|
| id | |
| organizationId | |
| attributeId | → Attribute |
| value | |
| sortOrder | |
| createdAt, updatedAt, deletedAt | |

### Product
The template — shared info only.
| column | notes |
|---|---|
| id | |
| organizationId | |
| categoryId | |
| brandId | nullable |
| baseUnitId | → Unit; the stocking unit |
| name | |
| description | |
| trackInventory | false for services / non-stock items |
| status | ACTIVE \| INACTIVE \| ARCHIVED |
| createdBy | logical ref → core DB |
| createdAt, updatedAt, deletedAt | |

- `sku`, `barcode`, prices, `reorderLevel` live on the **variant**, not here.

### ProductAttribute
Which attributes this product varies on.
| column | notes |
|---|---|
| id | |
| productId | |
| attributeId | |

- unique `(productId, attributeId)`

### ProductVariant
The actual SKU / stock-keeping unit.
| column | notes |
|---|---|
| id | |
| organizationId | denormalized for tenant-scoped queries |
| productId | |
| name | "T-Shirt / Red / L" |
| sku | unique per org |
| barcode | unique per org, nullable |
| costPrice | DEFAULT/standard cost — **not** the valuation source |
| sellingPrice | |
| status | |
| isDefault | true for the single implicit variant of a simple product |
| createdAt, updatedAt, deletedAt | |

### VariantAttributeValue
Links a variant to its Red + L.
| column | notes |
|---|---|
| id | |
| variantId | |
| attributeValueId | |

- unique `(variantId, attributeValueId)`

### ProductImage
| column | notes |
|---|---|
| id | |
| productId | |
| variantId | nullable — variant-specific vs product-level image |
| url | |
| isPrimary | |
| sortOrder | |
| createdAt | |

---

## Branches & stock levels

### Branch
The stocking place. Users may see this as "Branch", "Store", "Warehouse",
"Location", etc. per `InventorySettings` — the table name stays `Branch`.
| column | notes |
|---|---|
| id | |
| organizationId | |
| name | |
| code | unique per org |
| location | address / geographic location text |
| isDefault | |
| status | |
| createdBy | |
| createdAt, updatedAt, deletedAt | |

### ReorderRule
Reorder points are **per branch**.
| column | notes |
|---|---|
| id | |
| organizationId | |
| variantId | |
| branchId | |
| reorderLevel | trigger point |
| reorderQuantity | target top-up |
| createdAt, updatedAt | |

- unique `(variantId, branchId)`

### Inventory
On-hand **cache**, keyed by variant + branch.
| column | notes |
|---|---|
| id | |
| organizationId | |
| variantId | |
| branchId | |
| quantity | physical on hand |
| reservedQuantity | committed to sales orders |
| incomingQuantity | on open POs / inbound in-transit |
| updatedAt | |

- unique `(variantId, branchId)`
- `available = quantity - reservedQuantity` (computed, never stored)

---

## The ledger (source of truth, append-only)

### InventoryMovement
| column | notes |
|---|---|
| id | |
| organizationId | |
| variantId | |
| branchId | |
| type | IN \| OUT (a transfer = an OUT + an IN) |
| quantity | always positive; direction comes from `type` |
| unitCost | cost **at time of movement** — enables FIFO / weighted-average later, impossible to rebuild afterward |
| balanceAfter | on-hand for this variant+branch after this row |
| referenceType | PURCHASE \| SALE \| ADJUSTMENT \| TRANSFER \| RETURN \| OPENING \| MANUAL |
| referenceId | source doc id (may live in another DB → logical ref) |
| reason | nullable |
| createdBy | |
| createdAt | |

- **No `updatedAt`, no `deletedAt`** — append-only. Corrections are new reversing rows.

---

## Operations (produce movements when completed)

### StockAdjustment
| column | notes |
|---|---|
| id | |
| organizationId | |
| number | "ADJ-0001", unique per org |
| branchId | |
| reason | |
| status | DRAFT \| PENDING_APPROVAL \| APPROVED \| COMPLETED \| CANCELLED |
| notes | |
| createdBy | |
| approvedBy | nullable |
| createdAt, updatedAt, completedAt, deletedAt | |

### StockAdjustmentItem
| column | notes |
|---|---|
| id | |
| adjustmentId | |
| variantId | |
| systemQuantity | snapshot at time of count |
| actualQuantity | |
| difference | actual - system (stored snapshot) |
| unitCost | to value the difference |

### StockTransfer
| column | notes |
|---|---|
| id | |
| organizationId | |
| number | "TRF-0001", unique per org |
| fromBranchId | |
| toBranchId | |
| status | DRAFT \| IN_TRANSIT \| PARTIALLY_RECEIVED \| COMPLETED \| CANCELLED |
| notes | |
| createdBy | |
| createdAt, updatedAt, shippedAt, receivedAt, deletedAt | |

### StockTransferItem
| column | notes |
|---|---|
| id | |
| transferId | |
| variantId | |
| quantity | requested |
| shippedQuantity | left source |
| receivedQuantity | arrived at destination |
| unitCost | carry cost across the move |

- `shippedQuantity` vs `receivedQuantity` handles in-transit stock and partial
  receipts — goods that left the source but haven't reached the destination aren't
  "lost."

---

## Cross-cutting rules to lock in

- **Enums** (DB enums or a constants table, not free strings): `Product.status`,
  `Branch.status`, `ProductVariant.status`, `InventoryMovement.type`,
  `InventoryMovement.referenceType`, and every document `status`.
- **Uniqueness (per org):** `ProductVariant.sku`, `ProductVariant.barcode`,
  `Branch.code`, `Unit (organizationId, name)`, `InventorySettings.organizationId`,
  plus `(variantId, branchId)` on both `Inventory` and `ReorderRule`.
- **Soft deletes:** `deletedAt` on all catalog/branch tables; nothing referenced by
  a movement is hard-deleted.
- **Money:** decimal or integer minor units, never float. Currency inherited from
  the org in the core DB.
- **Valuation:** every movement carries `unitCost`, so the schema is FIFO- and
  weighted-average-ready. `ProductVariant.costPrice` is only a default for new POs;
  real COGS is computed from the ledger.
- **Suppliers / purchase orders** deliberately live in a Purchasing app. Stock
  receipts reference them via `referenceType = PURCHASE` + `referenceId`. Add a
  local `Supplier` table only if the inventory app itself owns basic purchasing.
- **Cross-DB display:** to show/filter by org or user name, either call the core
  service at read time or maintain a thin synced read-only mirror
  (`OrganizationRef` / `UserRef`) updated via events. Start with service calls; add
  the mirror only if join/filter performance forces it.

---

## Open decisions

- **Variant creation:** auto-generate the full matrix from selected attribute values
  (Color × Size → all combinations, Odoo-style) vs. hand-pick which combinations
  exist. Doesn't change the tables; changes the variant-creation logic.
