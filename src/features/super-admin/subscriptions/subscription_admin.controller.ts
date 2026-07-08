import asyncHandler from "express-async-handler";
import { BillingProvider } from "../../../generated/prisma/enums.js";
import { prisma } from "../../../prisma.js";
import {
  normalizeNullableText,
  normalizeRequiredText,
} from "../../../utils/validation.utils.js";
import {
  findAppForPlan,
  findSubscriptionPlan,
  normalizeAmount,
  normalizeCurrency,
  normalizeProviderPriceId,
  normalizeSortOrder,
  parseBillingInterval,
  serializeSubscriptionPlan,
  subscriptionPlanInclude,
} from "./subscription_admin.helpers.js";

export const createSubscriptionPlan = asyncHandler(async (req, res) => {
  const name = normalizeRequiredText(req.body.name, 150);
  const description = normalizeNullableText(req.body.description);
  const sortOrder = normalizeSortOrder(req.body.sortOrder);
  const isActive =
    req.body.isActive === undefined ? true : req.body.isActive === true;

  if (!name || description === undefined || sortOrder === null) {
    res.status(400).json({
      success: false,
      message: "A valid name, description, and sortOrder are required",
    });
    return;
  }
  if (req.body.isActive !== undefined && typeof req.body.isActive !== "boolean") {
    res.status(400).json({
      success: false,
      message: "isActive must be a boolean",
    });
    return;
  }

  const plan = await prisma.subscriptionPlan.create({
    data: {
      name,
      description,
      sortOrder: sortOrder ?? 0,
      isActive,
    },
    include: subscriptionPlanInclude,
  });

  res.status(201).json({
    success: true,
    message: "Subscription plan created successfully",
    data: { plan: serializeSubscriptionPlan(plan) },
  });
});

export const listSubscriptionPlans = asyncHandler(async (_req, res) => {
  const plans = await prisma.subscriptionPlan.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: subscriptionPlanInclude,
  });

  res.status(200).json({
    success: true,
    data: { plans: plans.map(serializeSubscriptionPlan) },
  });
});

export const getSubscriptionPlan = asyncHandler(async (req, res) => {
  const plan = await findSubscriptionPlan(req.params.planId, res);
  if (!plan) return;

  res.status(200).json({
    success: true,
    data: { plan: serializeSubscriptionPlan(plan) },
  });
});

export const updateSubscriptionPlanDetails = asyncHandler(async (req, res) => {
  const plan = await findSubscriptionPlan(req.params.planId, res);
  if (!plan) return;

  const data: {
    name?: string;
    description?: string | null;
    sortOrder?: number;
  } = {};

  if ("name" in req.body) {
    const name = normalizeRequiredText(req.body.name, 150);
    if (!name) {
      res.status(400).json({ success: false, message: "Invalid plan name" });
      return;
    }
    data.name = name;
  }

  if ("description" in req.body) {
    const description = normalizeNullableText(req.body.description);
    if (description === undefined) {
      res.status(400).json({ success: false, message: "Invalid description" });
      return;
    }
    data.description = description;
  }

  if ("sortOrder" in req.body) {
    const sortOrder = normalizeSortOrder(req.body.sortOrder);
    if (sortOrder === null || sortOrder === undefined) {
      res.status(400).json({ success: false, message: "Invalid sortOrder" });
      return;
    }
    data.sortOrder = sortOrder;
  }

  if (!Object.keys(data).length) {
    res.status(400).json({
      success: false,
      message: "Provide at least one plan detail to update",
    });
    return;
  }

  const updated = await prisma.subscriptionPlan.update({
    where: { id: plan.id },
    data,
    include: subscriptionPlanInclude,
  });

  res.status(200).json({
    success: true,
    message: "Subscription plan updated successfully",
    data: { plan: serializeSubscriptionPlan(updated) },
  });
});

export const changeSubscriptionPlanStatus = asyncHandler(async (req, res) => {
  const plan = await findSubscriptionPlan(req.params.planId, res);
  if (!plan) return;
  if (typeof req.body.isActive !== "boolean") {
    res.status(400).json({
      success: false,
      message: "isActive must be a boolean",
    });
    return;
  }

  const updated = await prisma.subscriptionPlan.update({
    where: { id: plan.id },
    data: { isActive: req.body.isActive },
    include: subscriptionPlanInclude,
  });

  res.status(200).json({
    success: true,
    message: "Subscription plan status updated successfully",
    data: { plan: serializeSubscriptionPlan(updated) },
  });
});

export const addSubscriptionPlanApp = asyncHandler(async (req, res) => {
  const plan = await findSubscriptionPlan(req.params.planId, res);
  if (!plan) return;
  const app = await findAppForPlan(req.body.appKey, res);
  if (!app) return;

  await prisma.subscriptionPlanApp.upsert({
    where: {
      planId_appId: {
        planId: plan.id,
        appId: app.id,
      },
    },
    create: {
      planId: plan.id,
      appId: app.id,
    },
    update: {},
  });

  const updated = await prisma.subscriptionPlan.findUniqueOrThrow({
    where: { id: plan.id },
    include: subscriptionPlanInclude,
  });

  res.status(200).json({
    success: true,
    message: "App added to subscription plan successfully",
    data: { plan: serializeSubscriptionPlan(updated) },
  });
});

export const removeSubscriptionPlanApp = asyncHandler(async (req, res) => {
  const plan = await findSubscriptionPlan(req.params.planId, res);
  if (!plan) return;
  const app = await findAppForPlan(req.params.appKey, res);
  if (!app) return;

  await prisma.subscriptionPlanApp.deleteMany({
    where: {
      planId: plan.id,
      appId: app.id,
    },
  });

  const updated = await prisma.subscriptionPlan.findUniqueOrThrow({
    where: { id: plan.id },
    include: subscriptionPlanInclude,
  });

  res.status(200).json({
    success: true,
    message: "App removed from subscription plan successfully",
    data: { plan: serializeSubscriptionPlan(updated) },
  });
});

export const upsertSubscriptionPlanPrice = asyncHandler(async (req, res) => {
  const plan = await findSubscriptionPlan(req.params.planId, res);
  if (!plan) return;

  const interval = parseBillingInterval(req.body.interval);
  const providerPriceId = normalizeProviderPriceId(req.body.providerPriceId);
  const currency = normalizeCurrency(req.body.currency);
  const amount = normalizeAmount(req.body.amount);
  const isActive =
    req.body.isActive === undefined ? true : req.body.isActive === true;

  if (!interval || !providerPriceId || !currency || amount === undefined) {
    res.status(400).json({
      success: false,
      message:
        "A valid interval, providerPriceId, amount, and currency are required",
    });
    return;
  }
  if (req.body.isActive !== undefined && typeof req.body.isActive !== "boolean") {
    res.status(400).json({
      success: false,
      message: "isActive must be a boolean",
    });
    return;
  }

  await prisma.subscriptionPlanPrice.upsert({
    where: {
      planId_provider_billingInterval: {
        planId: plan.id,
        provider: BillingProvider.STRIPE,
        billingInterval: interval,
      },
    },
    create: {
      planId: plan.id,
      provider: BillingProvider.STRIPE,
      billingInterval: interval,
      providerPriceId,
      amount,
      currency,
      isActive,
    },
    update: {
      providerPriceId,
      amount,
      currency,
      isActive,
    },
  });

  const updated = await prisma.subscriptionPlan.findUniqueOrThrow({
    where: { id: plan.id },
    include: subscriptionPlanInclude,
  });

  res.status(200).json({
    success: true,
    message: "Subscription plan price saved successfully",
    data: { plan: serializeSubscriptionPlan(updated) },
  });
});

export const changeSubscriptionPlanPriceStatus = asyncHandler(
  async (req, res) => {
    const plan = await findSubscriptionPlan(req.params.planId, res);
    if (!plan) return;
    const interval = parseBillingInterval(req.params.interval);
    if (!interval) {
      res.status(400).json({
        success: false,
        message: "interval must be month or year",
      });
      return;
    }
    if (typeof req.body.isActive !== "boolean") {
      res.status(400).json({
        success: false,
        message: "isActive must be a boolean",
      });
      return;
    }

    const updatedCount = await prisma.subscriptionPlanPrice.updateMany({
      where: {
        planId: plan.id,
        provider: BillingProvider.STRIPE,
        billingInterval: interval,
      },
      data: { isActive: req.body.isActive },
    });
    if (!updatedCount.count) {
      res.status(404).json({
        success: false,
        message: "Subscription plan price not found",
      });
      return;
    }

    const updated = await prisma.subscriptionPlan.findUniqueOrThrow({
      where: { id: plan.id },
      include: subscriptionPlanInclude,
    });

    res.status(200).json({
      success: true,
      message: "Subscription plan price status updated successfully",
      data: { plan: serializeSubscriptionPlan(updated) },
    });
  },
);
