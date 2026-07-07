import "dotenv/config";
import {
  BillingInterval,
  BillingProvider,
} from "../src/generated/prisma/enums.js";
import { prisma } from "../src/prisma.js";

const PLAN_CATALOG = [
  {
    key: "starter",
    name: "Starter",
    sortOrder: 10,
    includedAppKeys: [] as string[],
    prices: [] as Array<{
      interval: BillingInterval;
      providerPriceId: string;
      amount?: number;
      currency: string;
    }>,
  },
  {
    key: "growth",
    name: "Growth",
    sortOrder: 20,
    includedAppKeys: [] as string[],
    prices: [],
  },
  {
    key: "business",
    name: "Business",
    sortOrder: 30,
    includedAppKeys: [] as string[],
    prices: [],
  },
];

async function main() {
  for (const planConfig of PLAN_CATALOG) {
    const plan = await prisma.subscriptionPlan.upsert({
      where: { key: planConfig.key },
      create: {
        key: planConfig.key,
        name: planConfig.name,
        sortOrder: planConfig.sortOrder,
      },
      update: {
        name: planConfig.name,
        sortOrder: planConfig.sortOrder,
        isActive: true,
      },
    });

    const apps = planConfig.includedAppKeys.length
      ? await prisma.app.findMany({
          where: { key: { in: planConfig.includedAppKeys } },
          select: { id: true },
        })
      : [];

    await prisma.subscriptionPlanApp.deleteMany({
      where: { planId: plan.id },
    });

    if (apps.length) {
      await prisma.subscriptionPlanApp.createMany({
        data: apps.map((app) => ({ planId: plan.id, appId: app.id })),
        skipDuplicates: true,
      });
    }

    for (const price of planConfig.prices) {
      await prisma.subscriptionPlanPrice.upsert({
        where: {
          planId_provider_billingInterval: {
            planId: plan.id,
            provider: BillingProvider.STRIPE,
            billingInterval: price.interval,
          },
        },
        create: {
          planId: plan.id,
          provider: BillingProvider.STRIPE,
          billingInterval: price.interval,
          providerPriceId: price.providerPriceId,
          amount: price.amount,
          currency: price.currency,
        },
        update: {
          providerPriceId: price.providerPriceId,
          amount: price.amount,
          currency: price.currency,
          isActive: true,
        },
      });
    }
  }

  console.log("Seeded subscription plans.");
}

main()
  .catch((error) => {
    console.error("Subscription seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
