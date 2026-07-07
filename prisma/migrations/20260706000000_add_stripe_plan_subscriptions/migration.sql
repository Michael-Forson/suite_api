-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingProvider') THEN
        CREATE TYPE "BillingProvider" AS ENUM ('STRIPE', 'PAYSTACK');
    END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingInterval') THEN
        CREATE TYPE "BillingInterval" AS ENUM ('MONTH', 'YEAR');
    END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SubscriptionStatus') THEN
        CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');
    END IF;
END $$;

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" BIGSERIAL NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plan_apps" (
    "id" BIGSERIAL NOT NULL,
    "plan_id" BIGINT NOT NULL,
    "app_id" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_plan_apps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plan_prices" (
    "id" BIGSERIAL NOT NULL,
    "plan_id" BIGINT NOT NULL,
    "provider" "BillingProvider" NOT NULL,
    "billing_interval" "BillingInterval" NOT NULL,
    "amount" DECIMAL(10,2),
    "currency" VARCHAR(3) NOT NULL,
    "provider_price_id" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plan_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_billing_customers" (
    "id" BIGSERIAL NOT NULL,
    "organization_id" BIGINT NOT NULL,
    "provider" "BillingProvider" NOT NULL,
    "provider_customer_id" VARCHAR(255) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_billing_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_subscriptions" (
    "id" BIGSERIAL NOT NULL,
    "organization_id" BIGINT NOT NULL,
    "plan_id" BIGINT NOT NULL,
    "provider" "BillingProvider" NOT NULL,
    "billing_interval" "BillingInterval" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "provider_customer_id" VARCHAR(255),
    "provider_subscription_id" VARCHAR(255),
    "current_period_end" TIMESTAMP(3),
    "provider_response" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_checkout_sessions" (
    "id" BIGSERIAL NOT NULL,
    "organization_id" BIGINT NOT NULL,
    "subscription_id" BIGINT NOT NULL,
    "provider" "BillingProvider" NOT NULL,
    "provider_session_id" VARCHAR(255) NOT NULL,
    "checkout_url" VARCHAR(1000) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'OPEN',
    "checkout_snapshot" JSONB,
    "provider_response" JSONB,
    "created_by" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_checkout_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_key_key" ON "subscription_plans"("key");

-- CreateIndex
CREATE INDEX "subscription_plans_is_active_idx" ON "subscription_plans"("is_active");

-- CreateIndex
CREATE INDEX "subscription_plans_sort_order_idx" ON "subscription_plans"("sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plan_apps_plan_id_app_id_key" ON "subscription_plan_apps"("plan_id", "app_id");

-- CreateIndex
CREATE INDEX "subscription_plan_apps_app_id_idx" ON "subscription_plan_apps"("app_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plan_prices_plan_id_provider_billing_interval_key" ON "subscription_plan_prices"("plan_id", "provider", "billing_interval");

-- CreateIndex
CREATE INDEX "subscription_plan_prices_provider_idx" ON "subscription_plan_prices"("provider");

-- CreateIndex
CREATE INDEX "subscription_plan_prices_billing_interval_idx" ON "subscription_plan_prices"("billing_interval");

-- CreateIndex
CREATE INDEX "subscription_plan_prices_is_active_idx" ON "subscription_plan_prices"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "organization_billing_customers_organization_id_provider_key" ON "organization_billing_customers"("organization_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "organization_billing_customers_provider_provider_customer_id_key" ON "organization_billing_customers"("provider", "provider_customer_id");

-- CreateIndex
CREATE INDEX "organization_billing_customers_organization_id_idx" ON "organization_billing_customers"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_subscriptions_organization_id_key" ON "organization_subscriptions"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_subscriptions_provider_subscription_id_key" ON "organization_subscriptions"("provider_subscription_id");

-- CreateIndex
CREATE INDEX "organization_subscriptions_plan_id_idx" ON "organization_subscriptions"("plan_id");

-- CreateIndex
CREATE INDEX "organization_subscriptions_provider_idx" ON "organization_subscriptions"("provider");

-- CreateIndex
CREATE INDEX "organization_subscriptions_status_idx" ON "organization_subscriptions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_checkout_sessions_provider_session_id_key" ON "subscription_checkout_sessions"("provider_session_id");

-- CreateIndex
CREATE INDEX "subscription_checkout_sessions_organization_id_idx" ON "subscription_checkout_sessions"("organization_id");

-- CreateIndex
CREATE INDEX "subscription_checkout_sessions_subscription_id_idx" ON "subscription_checkout_sessions"("subscription_id");

-- CreateIndex
CREATE INDEX "subscription_checkout_sessions_provider_idx" ON "subscription_checkout_sessions"("provider");

-- CreateIndex
CREATE INDEX "subscription_checkout_sessions_created_by_idx" ON "subscription_checkout_sessions"("created_by");

-- AddForeignKey
ALTER TABLE "subscription_plan_apps" ADD CONSTRAINT "subscription_plan_apps_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_plan_apps" ADD CONSTRAINT "subscription_plan_apps_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_plan_prices" ADD CONSTRAINT "subscription_plan_prices_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_billing_customers" ADD CONSTRAINT "organization_billing_customers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "organization_subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "organization_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_checkout_sessions" ADD CONSTRAINT "subscription_checkout_sessions_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "organization_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
