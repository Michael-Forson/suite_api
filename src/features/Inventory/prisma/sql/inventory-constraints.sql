-- Constraints Prisma cannot express, applied by hand after `inventory:migrate`.
--
-- Run once against the inventory database, and re-run after any migration that
-- recreates the `inventory` unique index:
--
--   psql "$INVENTORY_DATABASE_URL" -f src/features/Inventory/prisma/sql/inventory-constraints.sql
--
-- Everything here is idempotent.

-- ---------------------------------------------------------------------------
-- 1. The `inventory` unique key must treat NULL lots as equal.
--
-- REQUIRED FOR CORRECTNESS — not a nicety. `postMovement` maintains on-hand with
-- a single atomic `INSERT … ON CONFLICT (variant_id, branch_id, lot_id) DO
-- UPDATE`, and that statement is the only thing serializing concurrent writers:
-- it takes the row lock, so a second poster for the same key blocks until the
-- first commits instead of computing `balanceAfter` from a stale read.
--
-- Postgres' default unique semantics treat every NULL as distinct from every
-- other NULL. Lot tracking is off by default, so `lot_id` is null on virtually
-- every row — and under the index Prisma generates, no conflict would ever be
-- detected. The upsert would insert a brand new `inventory` row per movement,
-- on-hand would read as the last delta rather than the running total, and it
-- would fail silently, with no error and no lock ever taken.
--
-- `NULLS NOT DISTINCT` (Postgres 15+) makes two null lots collide as they
-- should. If this database is on Postgres 14 or older, do not simply skip this:
-- either upgrade, or make `lot_id` NOT NULL with a sentinel UUID for "no lot".
ALTER TABLE inventory
  DROP CONSTRAINT IF EXISTS inventory_variant_id_branch_id_lot_id_key;

DROP INDEX IF EXISTS inventory_variant_id_branch_id_lot_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_variant_branch_lot_key
  ON inventory (variant_id, branch_id, lot_id) NULLS NOT DISTINCT;

-- ---------------------------------------------------------------------------
-- 2. Ledger sanity checks.
--
-- `quantity` carries magnitude only; direction is `type`. A negative quantity
-- would double-count as a sign flip and cannot be corrected once written.
ALTER TABLE inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_quantity_positive;

ALTER TABLE inventory_movements
  ADD CONSTRAINT inventory_movements_quantity_positive
  CHECK (quantity > 0);

-- `referenceType` of PURCHASE / SALE / TRANSFER names a document elsewhere, so
-- a null `reference_id` on those leaves a movement that cannot be traced back to
-- anything. ADJUSTMENT, RETURN, OPENING and MANUAL may legitimately stand alone.
ALTER TABLE inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_reference_id_required;

ALTER TABLE inventory_movements
  ADD CONSTRAINT inventory_movements_reference_id_required
  CHECK (
    reference_type NOT IN ('PURCHASE', 'SALE', 'TRANSFER')
    OR reference_id IS NOT NULL
  );

-- ---------------------------------------------------------------------------
-- 3. A transfer between a branch and itself is a no-op that still writes two
-- ledger rows.
ALTER TABLE stock_transfers
  DROP CONSTRAINT IF EXISTS stock_transfers_distinct_branches;

ALTER TABLE stock_transfers
  ADD CONSTRAINT stock_transfers_distinct_branches
  CHECK (from_branch_id <> to_branch_id);
