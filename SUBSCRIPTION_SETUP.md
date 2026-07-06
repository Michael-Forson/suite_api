# Subscription Setup

This project uses a simple Stripe-only subscription MVP.

- Super-admins manage the subscription catalog.
- Organizations subscribe through Stripe Checkout.
- Stripe webhooks activate or suspend paid app access.
- There is no free trial and no add-on app billing yet.

## 1. Environment Variables

Add these values to the API environment:

```bash
STRIPE_SECRET_KEY=sk_test_or_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_SUBSCRIPTION_SUCCESS_URL=https://your-frontend.example.com/billing/success?session_id={CHECKOUT_SESSION_ID}
STRIPE_SUBSCRIPTION_CANCEL_URL=https://your-frontend.example.com/billing/cancel
```

Only Stripe secrets and redirect URLs belong in env.

Stripe price IDs belong in the database through the super-admin subscription
endpoints.

## 2. Run Migrations

Apply the database migrations:

```bash
npx prisma migrate deploy
npx prisma generate
```

For the test database:

```bash
npm run test:db:migrate
```

## 3. Register Apps

Create the business apps first from the super-admin app endpoints.

Example:

```http
POST /super-admin/api/v1/apps
Authorization: Bearer <superAdminToken>
Content-Type: application/json
```

```json
{
  "key": "invoicing",
  "name": "Invoicing",
  "description": "Create and manage invoices",
  "status": "ACTIVE"
}
```

Repeat this for every app that can be included in a plan.

## 4. Create Subscription Plans

Create the 3 MVP plans:

```http
POST /super-admin/api/v1/subscriptions/plans
Authorization: Bearer <superAdminToken>
Content-Type: application/json
```

```json
{
  "key": "starter",
  "name": "Starter",
  "description": "For small teams",
  "sortOrder": 10,
  "isActive": true
}
```

Recommended MVP keys:

- `starter`
- `growth`
- `business`

The plan key is permanent after creation.

## 5. Add Apps To Plans

Attach included apps to each plan:

```http
POST /super-admin/api/v1/subscriptions/plans/starter/apps
Authorization: Bearer <superAdminToken>
Content-Type: application/json
```

```json
{
  "appKey": "invoicing"
}
```

Removing an app from a plan only removes the plan-app relationship:

```http
DELETE /super-admin/api/v1/subscriptions/plans/starter/apps/invoicing
Authorization: Bearer <superAdminToken>
```

Important: changing plan apps can affect entitlement behavior for active
subscriptions unless entitlement snapshots are added later. For now, treat plan
composition changes as catalog/admin operations that should be done carefully.

## 6. Create Stripe Products And Prices

In Stripe Dashboard:

1. Create a product for each plan, or one product with multiple prices.
2. Create recurring prices for each interval you support.
3. Copy the Stripe Price IDs, such as `price_123`.

Example prices:

- Starter monthly: `price_starter_month`
- Starter yearly: `price_starter_year`
- Growth monthly: `price_growth_month`
- Business monthly: `price_business_month`

## 7. Save Stripe Price IDs In The Database

Use the super-admin price endpoint:

```http
PUT /super-admin/api/v1/subscriptions/plans/starter/prices
Authorization: Bearer <superAdminToken>
Content-Type: application/json
```

```json
{
  "interval": "month",
  "providerPriceId": "price_123",
  "amount": 29,
  "currency": "USD",
  "isActive": true
}
```

For yearly pricing:

```json
{
  "interval": "year",
  "providerPriceId": "price_456",
  "amount": 290,
  "currency": "USD",
  "isActive": true
}
```

Disable a price without deleting it:

```http
PATCH /super-admin/api/v1/subscriptions/plans/starter/prices/month/status
Authorization: Bearer <superAdminToken>
Content-Type: application/json
```

```json
{
  "isActive": false
}
```

## 8. Customer Plan Listing

Organizations can list available plans:

```http
GET /user/api/v1/organizations/:organizationId/subscriptions/plans?interval=month
Authorization: Bearer <userToken>
```

A plan is checkout-ready only when it has an active Stripe price for the
requested interval.

## 9. Customer Checkout

Organization owners/admins start checkout:

```http
POST /user/api/v1/organizations/:organizationId/subscriptions/checkout
Authorization: Bearer <userToken>
Content-Type: application/json
```

```json
{
  "planKey": "starter",
  "interval": "month"
}
```

The backend creates a local pending subscription and returns a Stripe Checkout
URL.

## 10. Stripe Webhook

Configure this webhook URL in Stripe:

```text
POST /user/api/v1/subscriptions/stripe/webhook
```

Listen for these events:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

The webhook updates subscription status and app access.

## Do We Still Need `seed:subscriptions`?

Not strictly.

The super-admin endpoints are now the main way to create and manage
subscription plans, included apps, and Stripe price IDs.

Keep `npm run seed:subscriptions` only as a bootstrap convenience:

- useful for local/dev setup
- useful if you want to quickly create the 3 default plan shells
- not required for production if super-admin setup is used

Right now the seed script creates only the plan shells because its included app
and price arrays are empty. So after running it, a super-admin still needs to:

1. add apps to each plan
2. add Stripe price IDs
3. ensure plans and prices are active

If you want production setup to be fully API/admin-driven, you can remove the
seed script later. If you want repeatable local bootstrap, keep it.

## Current MVP Limitations

- No free trial.
- No add-on app billing.
- No Paystack checkout yet.
- No manual organization subscription assignment by super-admin.
- Plan app changes should be handled carefully until entitlement snapshots are
  added.
