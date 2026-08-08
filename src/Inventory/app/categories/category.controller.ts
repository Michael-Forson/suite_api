import asyncHandler from "express-async-handler";
import {
  badRequest,
  handleInventoryErrors,
} from "../../shared/inventory.errors.js";
import {
  InventoryRequest,
  inventoryContext,
  requireIdParam,
} from "../../shared/inventory.middleware.js";
import { parseListQuery } from "../../shared/inventory.utils.js";
import * as categoryService from "./category.service.js";

/**
 * `null` reparents to the root; `undefined` means the caller did not mention a
 * parent at all. JSON cannot tell them apart on its own, so `move` requires the
 * key to be present.
 */
const parentFromBody = (body: any, key = "parentCategoryId") => {
  const value = body?.[key];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw badRequest("Invalid parent category id");
  return requireIdParam(value, "parent category id");
};

export const listCategories = asyncHandler(
  async (req: InventoryRequest, res) => {
    const context = inventoryContext(req, res);
    if (!context) return;

    await handleInventoryErrors(res, async () => {
      const query = parseListQuery(req.query as Record<string, unknown>);
      const rootOnly = req.query.rootOnly === "true";
      const parentCategoryId =
        typeof req.query.parentCategoryId === "string"
          ? requireIdParam(req.query.parentCategoryId, "parent category id")
          : undefined;

      const result = await categoryService.listCategories(
        context.organizationId,
        query,
        { rootOnly, parentCategoryId },
      );
      res.status(200).json({ success: true, data: result });
    });
  },
);

export const getCategoryTree = asyncHandler(
  async (req: InventoryRequest, res) => {
    const context = inventoryContext(req, res);
    if (!context) return;

    await handleInventoryErrors(res, async () => {
      const tree = await categoryService.getCategoryTree(
        context.organizationId,
      );
      res.status(200).json({ success: true, data: { tree } });
    });
  },
);

export const getCategory = asyncHandler(async (req: InventoryRequest, res) => {
  const context = inventoryContext(req, res);
  if (!context) return;

  await handleInventoryErrors(res, async () => {
    const categoryId = requireIdParam(req.params.categoryId, "category id");
    const category = await categoryService.getCategory(
      context.organizationId,
      categoryId,
    );
    res.status(200).json({ success: true, data: { category } });
  });
});

export const createCategory = asyncHandler(
  async (req: InventoryRequest, res) => {
    const context = inventoryContext(req, res);
    if (!context) return;

    await handleInventoryErrors(res, async () => {
      const category = await categoryService.createCategory(
        context.organizationId,
        {
          name: req.body?.name,
          parentCategoryId: parentFromBody(req.body),
        },
      );
      res.status(201).json({
        success: true,
        message: "Category created successfully",
        data: { category },
      });
    });
  },
);

export const updateCategory = asyncHandler(
  async (req: InventoryRequest, res) => {
    const context = inventoryContext(req, res);
    if (!context) return;

    await handleInventoryErrors(res, async () => {
      const categoryId = requireIdParam(req.params.categoryId, "category id");
      const category = await categoryService.updateCategory(
        context.organizationId,
        categoryId,
        { name: req.body?.name },
      );
      res.status(200).json({
        success: true,
        message: "Category updated successfully",
        data: { category },
      });
    });
  },
);

export const moveCategory = asyncHandler(async (req: InventoryRequest, res) => {
  const context = inventoryContext(req, res);
  if (!context) return;

  await handleInventoryErrors(res, async () => {
    const categoryId = requireIdParam(req.params.categoryId, "category id");

    if (!(req.body && "parentCategoryId" in req.body)) {
      throw badRequest(
        "parentCategoryId is required; send null to move the category to the top level",
      );
    }

    const category = await categoryService.moveCategory(
      context.organizationId,
      categoryId,
      parentFromBody(req.body),
    );
    res.status(200).json({
      success: true,
      message: "Category moved successfully",
      data: { category },
    });
  });
});

export const deleteCategory = asyncHandler(
  async (req: InventoryRequest, res) => {
    const context = inventoryContext(req, res);
    if (!context) return;

    await handleInventoryErrors(res, async () => {
      const categoryId = requireIdParam(req.params.categoryId, "category id");
      const category = await categoryService.deleteCategory(
        context.organizationId,
        categoryId,
      );
      res.status(200).json({
        success: true,
        message: "Category deleted successfully",
        data: { category },
      });
    });
  },
);

export const restoreCategory = asyncHandler(
  async (req: InventoryRequest, res) => {
    const context = inventoryContext(req, res);
    if (!context) return;

    await handleInventoryErrors(res, async () => {
      const categoryId = requireIdParam(req.params.categoryId, "category id");
      const category = await categoryService.restoreCategory(
        context.organizationId,
        categoryId,
      );
      res.status(200).json({
        success: true,
        message: "Category restored successfully",
        data: { category },
      });
    });
  },
);
