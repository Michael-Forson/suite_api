import asyncHandler from "express-async-handler";
import { handleInventoryErrors } from "../../shared/inventory.errors.js";
import {
  InventoryRequest,
  inventoryContext,
  requireIdParam,
} from "../../shared/inventory.middleware.js";
import { parseListQuery } from "../../shared/inventory.utils.js";
import * as unitService from "./unit.service.js";

export const listUnits = asyncHandler(async (req: InventoryRequest, res) => {
  const context = inventoryContext(req, res);
  if (!context) return;

  await handleInventoryErrors(res, async () => {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const result = await unitService.listUnits(context.organizationId, query);
    res.status(200).json({ success: true, data: result });
  });
});

export const getUnit = asyncHandler(async (req: InventoryRequest, res) => {
  const context = inventoryContext(req, res);
  if (!context) return;

  await handleInventoryErrors(res, async () => {
    const unitId = requireIdParam(req.params.unitId, "unit id");
    const unit = await unitService.getUnit(context.organizationId, unitId);
    res.status(200).json({ success: true, data: { unit } });
  });
});

export const createUnit = asyncHandler(async (req: InventoryRequest, res) => {
  const context = inventoryContext(req, res);
  if (!context) return;

  await handleInventoryErrors(res, async () => {
    const unit = await unitService.createUnit(context.organizationId, {
      name: req.body?.name,
      symbol: req.body?.symbol,
    });
    res.status(201).json({
      success: true,
      message: "Unit created successfully",
      data: { unit },
    });
  });
});

export const updateUnit = asyncHandler(async (req: InventoryRequest, res) => {
  const context = inventoryContext(req, res);
  if (!context) return;

  await handleInventoryErrors(res, async () => {
    const unitId = requireIdParam(req.params.unitId, "unit id");
    const unit = await unitService.updateUnit(context.organizationId, unitId, {
      name: req.body?.name,
      symbol: req.body?.symbol,
    });
    res.status(200).json({
      success: true,
      message: "Unit updated successfully",
      data: { unit },
    });
  });
});

export const deleteUnit = asyncHandler(async (req: InventoryRequest, res) => {
  const context = inventoryContext(req, res);
  if (!context) return;

  await handleInventoryErrors(res, async () => {
    const unitId = requireIdParam(req.params.unitId, "unit id");
    const unit = await unitService.deleteUnit(context.organizationId, unitId);
    res.status(200).json({
      success: true,
      message: "Unit deleted successfully",
      data: { unit },
    });
  });
});

export const restoreUnit = asyncHandler(async (req: InventoryRequest, res) => {
  const context = inventoryContext(req, res);
  if (!context) return;

  await handleInventoryErrors(res, async () => {
    const unitId = requireIdParam(req.params.unitId, "unit id");
    const unit = await unitService.restoreUnit(context.organizationId, unitId);
    res.status(200).json({
      success: true,
      message: "Unit restored successfully",
      data: { unit },
    });
  });
});

export const seedDefaultUnits = asyncHandler(
  async (req: InventoryRequest, res) => {
    const context = inventoryContext(req, res);
    if (!context) return;

    await handleInventoryErrors(res, async () => {
      const created = await unitService.seedDefaultUnits(
        context.organizationId,
      );
      res.status(200).json({
        success: true,
        message: `${created} default unit(s) added`,
        data: { created },
      });
    });
  },
);
