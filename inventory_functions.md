# Inventory App — Service Functions

Service-layer function names, grouped by module. HTTP routes map onto these.

## Units
```
createUnit            updateUnit           deleteUnit
getUnit               listUnits            seedDefaultUnits        # on org creation
```

## Categories
```
createCategory        updateCategory       deleteCategory
getCategory           listCategories       getCategoryTree         # nested/parent-child
moveCategory          # reparent
```

## Brands
```
createBrand           updateBrand          deleteBrand
getBrand              listBrands
```

## Attributes & values
```
createAttribute       updateAttribute      deleteAttribute       listAttributes
createAttributeValue  updateAttributeValue deleteAttributeValue  listAttributeValues
```

## Products
```
createProduct         updateProduct        archiveProduct        # soft delete
getProduct            listProducts         searchProducts
setProductAttributes  # which axes it varies on
```

## Variants
```
createVariant         updateVariant        archiveVariant
getVariant            listVariantsByProduct
generateVariantMatrix # auto-build combinations from selected attribute values
setVariantAttributeValues
getVariantBySku       getVariantByBarcode
```

## Product images
```
addProductImage       deleteProductImage   reorderProductImages   setPrimaryImage
listProductImages
```

## Branches — *not this app*

Branches live in the **core** database, because a branch is a fact the whole
business shares: it has an address and a code, staff clock in against it, and
POS and Accounting both read it. Inventory holds `branchId` as a logical
reference with no foreign key and **cannot write branches**. Branch CRUD belongs
in core, alongside organizations.

What this app has is a read-only door — `branch.service.ts`:
```
getDefaultBranchId    assertBranchBelongsToOrg    resolveBranchId
```
Every write path resolves and validates its branch through these before posting,
because no foreign key can do it for them.

The location label ("Branch" / "Store" / "Warehouse") also lives in core, on
`organizations` — it is org-wide vocabulary that POS and Attendance must agree
with, so it is deliberately *not* an inventory setting.

## Locations

Where stock actually sits: a place inside a branch. Shop floor, back store,
damaged pile, online reserve. Unlike branches these are owned by this app, with
real foreign keys, because nothing outside inventory has an opinion about which
shelf something is on.

```
createLocation        updateLocation       archiveLocation
getLocation           listLocations        listLocationsByBranch
setDefaultLocation
getDefaultLocationId  # creates the branch's default on demand
assertLocationBelongsToOrg
resolveLocation       # location → branch default → org default; the write-path shape
```

Every branch has exactly one default location, so a single-location business
never picks one and need not see this module at all.

## Settings
```
getInventorySettings  updateInventorySettings   # lotTracking lives here
```

## Lots

Batch and expiry tracking, gated on `InventorySettings.lotTracking`. The columns
exist on the ledger from day one — an append-only table cannot be backfilled —
but nothing surfaces them until the flag is on. These may be stubs until then;
they are named now so the shape is visible.

```
createLot             updateLot            getLot                listLots
getExpiringLots       # expiry reporting
selectLotsForIssue    # FEFO picking on OUT movements
```

## Inventory levels (reads)
```
getStockLevel                 # one variant at one location — the real key
getStockByBranch              # one variant, summed across a branch's locations
getStockAcrossBranches        # one variant, everywhere
listStockByLocation           listStockByBranch
getAvailableQuantity          # quantity - reserved, sellable locations only
recomputeInventoryCache       # rebuild the cache from the ledger (repair tool)
```

## Reservations — *needs a table first*

```
reserveStock          releaseReservation        # BLOCKED
```

These currently have nothing behind them. `Inventory.reservedQuantity` is a bare
counter in a schema whose whole philosophy is "quantities derive from an audit
trail": a crashed checkout or abandoned order leaks availability permanently,
with nothing to recompute from. Building these means first adding a
`StockReservation` table (reference, status, expiry, released-at) so
`reservedQuantity` becomes a cache the way `quantity` already is.

Note the difference from locations. A location gives **hard** separation — stock
physically moved into "Online Reserve" and invisible to the till. Reservations
give **soft** allocation — one pool, orders hold against it. An online/offline
split usually wants the second.

## Movements (the ledger — the core write path)
```
postMovement          # append row + move the on-hand cache, in one txn
reverseMovement       # append a compensating row; never edits or deletes
recordOpeningStock    # postMovement with referenceType OPENING
writeOffStock         # transfer to an isSellable:false location, not a deletion
listMovements         getMovementsByReference
verifyLedgerIntegrity # read-only: re-walk history, report balanceAfter drift
```

`verifyLedgerIntegrity` earns its place because nothing else repairs the
*ledger*. `recomputeInventoryCache` rebuilds `Inventory` from movements, but if
`balanceAfter` is itself wrong — the exact failure the row lock in `postMovement`
exists to prevent — there is no tool and no fix, because the rows are immutable.
This walks one variant+location's history, compares each `balanceAfter` against
the running sum, and reports the first divergence. It is how a concurrency bug
gets *detected* in production.

## Reorder rules
```
setReorderRule        removeReorderRule    listReorderRules
getLowStockItems      # variants at/below reorderLevel
```

Reorder points are per **branch**, not per location — you reorder for the store,
not for a shelf.

## Stock adjustments
```
createAdjustment      addAdjustmentItem    updateAdjustmentItem   removeAdjustmentItem
submitAdjustment      approveAdjustment    completeAdjustment     # posts movements
cancelAdjustment      getAdjustment        listAdjustments
```

An adjustment counts one **location**, not a whole building.

## Stock transfers
```
createTransfer        addTransferItem      updateTransferItem     removeTransferItem
shipTransfer          # posts OUT movements, sets in-transit
receiveTransfer       # posts IN movements; supports partial
cancelTransfer        getTransfer          listTransfers
```

Transfers move stock **location to location**, which makes shop floor → online
reserve the same mechanism as branch → branch rather than a second feature. Only
the two locations must differ; same-branch transfers are legitimate.

## Valuation & reporting
```
getStockValuation           # FIFO or weighted-average, computed from movements
getInventoryAgeing
getStockSummary             # dashboard totals
```

Movement history is `listMovements` above — reporting does not get its own
near-duplicate of it.

---

## Naming conventions to lock in

- **Document verbs mirror the status enum.** The progression `submit` → `approve` →
  `complete`/`cancel` matches the `status` values, so a status tells you which
  function produced it.
- **`postMovement` is the only function that writes `Inventory.quantity`.**
  Adjustments, transfers, receipts and sales all call it rather than touching
  `Inventory` directly — including `reverseMovement`, which is a thin wrapper
  that posts the opposite row. One choke point is what keeps the ledger and the
  cache from ever drifting.
  - `recomputeInventoryCache` is the sole exception, and exists only to repair
    drift that should never occur.
  - `reserveStock` writes `reservedQuantity`, a different column, and is blocked
    on the table above.
- **Reads take a location; callers may supply a branch instead.** `resolveLocation`
  turns "a location", "just a branch", or "nothing at all" into a validated
  location, so single-location businesses never encounter the concept.
