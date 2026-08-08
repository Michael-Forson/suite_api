import asyncHandler from "express-async-handler";
import { handleInventoryErrors } from "../../shared/inventory.errors.js";
import {
  InventoryRequest,
  inventoryContext,
  requireIdParam,
} from "../../shared/inventory.middleware.js";
import { parseListQuery } from "../../shared/inventory.utils.js";
import * as brandService from "./brand.service.js";

export const listBrands = asyncHandler(async (req: InventoryRequest, res) => {
  const context = inventoryContext(req, res);
  if (!context) return;

  await handleInventoryErrors(res, async () => {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const result = await brandService.listBrands(context.organizationId, query);
    res.status(200).json({ success: true, data: result });
  });
});

export const getBrand = asyncHandler(async (req: InventoryRequest, res) => {
  const context = inventoryContext(req, res);
  if (!context) return;

  await handleInventoryErrors(res, async () => {
    const brandId = requireIdParam(req.params.brandId, "brand id");
    const brand = await brandService.getBrand(context.organizationId, brandId);
    res.status(200).json({ success: true, data: { brand } });
  });
});

export const createBrand = asyncHandler(async (req: InventoryRequest, res) => {
  const context = inventoryContext(req, res);
  if (!context) return;

  await handleInventoryErrors(res, async () => {
    const brand = await brandService.createBrand(context.organizationId, {
      name: req.body?.name,
    });
    res.status(201).json({
      success: true,
      message: "Brand created successfully",
      data: { brand },
    });
  });
});

export const updateBrand = asyncHandler(async (req: InventoryRequest, res) => {
  const context = inventoryContext(req, res);
  if (!context) return;

  await handleInventoryErrors(res, async () => {
    const brandId = requireIdParam(req.params.brandId, "brand id");
    const brand = await brandService.updateBrand(
      context.organizationId,
      brandId,
      { name: req.body?.name },
    );
    res.status(200).json({
      success: true,
      message: "Brand updated successfully",
      data: { brand },
    });
  });
});

export const deleteBrand = asyncHandler(async (req: InventoryRequest, res) => {
  const context = inventoryContext(req, res);
  if (!context) return;

  await handleInventoryErrors(res, async () => {
    const brandId = requireIdParam(req.params.brandId, "brand id");
    const brand = await brandService.deleteBrand(
      context.organizationId,
      brandId,
    );
    res.status(200).json({
      success: true,
      message: "Brand deleted successfully",
      data: { brand },
    });
  });
});

export const restoreBrand = asyncHandler(async (req: InventoryRequest, res) => {
  const context = inventoryContext(req, res);
  if (!context) return;

  await handleInventoryErrors(res, async () => {
    const brandId = requireIdParam(req.params.brandId, "brand id");
    const brand = await brandService.restoreBrand(
      context.organizationId,
      brandId,
    );
    res.status(200).json({
      success: true,
      message: "Brand restored successfully",
      data: { brand },
    });
  });
});
