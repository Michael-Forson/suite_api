import { Response } from "express";
import {
  BillingInterval,
  BillingProvider,
} from "../../generated/prisma/enums.js";
import { prisma } from "../../prisma.js";
import { appKeyFromValue } from "../../utils/app.utils.js";
import { parseId } from "../../../utils/parseId.js";
import { publicUrl } from "../../../utils/s3.js";

export const normalizePlanId = (value: unknown) =>
  typeof value === "string" ? parseId(value) : null;

export const parseBillingInterval = (value: unknown) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "month" || normalized === "monthly")
    return BillingInterval.MONTH;
  if (normalized === "year" || normalized === "yearly")
    return BillingInterval.YEAR;
  return null;
};

export const normalizeSortOrder = (value: unknown) => {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
};

export const normalizeCurrency = (value: unknown) => {
  if (typeof value !== "string") return null;
  const currency = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : null;
};

export const normalizeProviderPriceId = (value: unknown) => {
  if (typeof value !== "string") return null;
  const providerPriceId = value.trim();
  return providerPriceId && providerPriceId.length <= 255
    ? providerPriceId
    : null;
};

export const normalizeAmount = (value: unknown) => {
  if (value === undefined || value === null || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : undefined;
};

const serializeMoney = (amount: unknown) =>
  amount === null || amount === undefined ? null : Number(amount);

export const serializeSubscriptionPlan = (plan: any) => ({
  id: plan.id.toString(),
  name: plan.name,
  description: plan.description,
  sortOrder: plan.sortOrder,
  isActive: plan.isActive,
  createdAt: plan.createdAt,
  updatedAt: plan.updatedAt,
  includedApps: (plan.includedApps || []).map(({ app }: any) => ({
    id: app.id.toString(),
    key: app.key,
    name: app.name,
    description: app.description,
    iconUrl: publicUrl(app.iconKey),
    status: app.status,
  })),
  prices: (plan.prices || []).map((price: any) => ({
    id: price.id.toString(),
    provider: price.provider,
    billingInterval: price.billingInterval,
    amount: serializeMoney(price.amount),
    currency: price.currency,
    providerPriceId: price.providerPriceId,
    isActive: price.isActive,
  })),
});

export const subscriptionPlanInclude = {
  includedApps: {
    include: { app: true },
    orderBy: { app: { name: "asc" } },
  },
  prices: {
    where: { provider: BillingProvider.STRIPE },
    orderBy: { billingInterval: "asc" },
  },
} as const;

export const findSubscriptionPlan = async (
  value: unknown,
  res: Response,
) => {
  const id = normalizePlanId(value);
  if (!id) {
    res.status(400).json({ success: false, message: "Invalid plan id" });
    return null;
  }

  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id },
    include: subscriptionPlanInclude,
  });
  if (!plan) {
    res.status(404).json({ success: false, message: "Subscription plan not found" });
    return null;
  }
  return plan;
};

export const findAppForPlan = async (value: unknown, res: Response) => {
  const key = appKeyFromValue(value);
  if (!key) {
    res.status(400).json({ success: false, message: "Invalid app key" });
    return null;
  }

  const app = await prisma.app.findUnique({
    where: { key },
    select: { id: true, key: true },
  });
  if (!app) {
    res.status(404).json({ success: false, message: "App not found" });
    return null;
  }
  return app;
};
