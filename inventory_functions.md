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

## Branches & settings
```
createBranch          updateBranch         archiveBranch
getBranch             listBranches         setDefaultBranch
getInventorySettings  updateInventorySettings   # includes the location label
```

## Inventory levels (reads + reservations)
```
getStockLevel                 # single variant + branch
getStockAcrossBranches        # one variant, all branches
listStockByBranch
getAvailableQuantity          # quantity - reserved
reserveStock                  releaseReservation
recomputeInventoryCache       # rebuild from ledger (repair tool)
```

## Movements (the ledger — the core write path)
```
postMovement          # append row + update Inventory cache in one txn
listMovements         getMovementsByReference
reverseMovement       # append a compensating row; never edits/deletes
recordOpeningStock
```

## Reorder rules
```
setReorderRule        removeReorderRule    listReorderRules
getLowStockItems      # variants at/below reorderLevel
```

## Stock adjustments
```
createAdjustment      addAdjustmentItem    updateAdjustmentItem   removeAdjustmentItem
submitAdjustment      approveAdjustment    completeAdjustment     # posts movements
cancelAdjustment      getAdjustment        listAdjustments
```

## Stock transfers
```
createTransfer        addTransferItem      updateTransferItem     removeTransferItem
shipTransfer          # posts OUT movements, sets in-transit
receiveTransfer       # posts IN movements; supports partial
cancelTransfer        getTransfer          listTransfers
```

## Valuation & reporting
```
getStockValuation           # FIFO or weighted-average, computed from movements
getInventoryAgeing
getMovementHistory
getStockSummary             # dashboard totals
```

---

## Naming conventions to lock in

- **Document verbs mirror the status enum.** The progression `submit` → `approve` →
  `complete`/`cancel` matches the `status` values, so a status tells you which
  function produced it.
- **Only two functions ever write stock quantities:** `postMovement` and
  `reverseMovement`. Everything else — adjustments, transfers — calls `postMovement`
  rather than writing to `Inventory` directly. That single choke point keeps the
  ledger and the cache from ever drifting.
