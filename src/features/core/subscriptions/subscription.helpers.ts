import {
  BillingInterval,
  SubscriptionStatus,
} from "../../../generated/prisma/enums.js";
import { parseId } from "../../../utils/parseId.js";

export const parseBillingInterval = (value: unknown) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "month" || normalized === "monthly")
    return BillingInterval.MONTH;
  if (normalized === "year" || normalized === "yearly")
    return BillingInterval.YEAR;
  return null;
};

export const normalizePlanId = (value: unknown) =>
  typeof value === "string" ? parseId(value) : null;

export const normalizeStripeSubscriptionStatus = (
  status?: string | null,
): SubscriptionStatus => {
  switch (status) {
    case "active":
    case "trialing":
      return SubscriptionStatus.ACTIVE;
    case "past_due":
      return SubscriptionStatus.PAST_DUE;
    case "canceled":
    case "unpaid":
      return SubscriptionStatus.CANCELED;
    case "incomplete_expired":
      return SubscriptionStatus.EXPIRED;
    default:
      return SubscriptionStatus.PENDING;
  }
};

export const subscriptionHasAccess = (status: SubscriptionStatus) =>
  status === SubscriptionStatus.ACTIVE;
