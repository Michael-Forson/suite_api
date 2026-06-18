# Starter API

Developer documentation for the Cho starter API. This package is an Express
and TypeScript backend starter with Prisma/PostgreSQL, user authentication,
Paystack payments, notifications, rate limiting, and helper integrations for
email, SMS, WhatsApp OTP, and S3-compatible storage.

## What Is Included

- Express 5 application setup with `helmet`, CORS, JSON parsing, and centralized
  error handling.
- TypeScript build output from `src/` to `dist/`.
- Prisma 7 client generated into `src/generated/prisma`.
- PostgreSQL access through `@prisma/adapter-pg`.
- User authentication with JWT access and refresh tokens.
- Phone OTP flows through SMS and WhatsApp helpers.
- Email verification helpers through Nodemailer.
- Paystack payment initialization, verification, status polling, and webhook
  handling.
- Expo push notification helpers and notification read state APIs.
- Rate limiters for general traffic, registration, login, OTP, and email flows.
- Dockerfile and simple Docker Compose service for the API.

## Requirements

- Node.js 20 or newer.
- npm.
- PostgreSQL database.
- Prisma CLI through the project dev dependency.
- Docker and Docker Compose, if running the containerized API.

## Quick Start

```bash
cd starter_api
npm install
npx prisma generate
npm run dev
```

The development server starts from `src/index.ts` and listens on `PORT`, or
`3000` when `PORT` is not set.

## Environment Variables

Create a local `.env` file in `starter_api/`. Do not commit real secrets.

| Name | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string used by Prisma and the Prisma adapter. |
| `PORT` | No | HTTP port. Defaults to `3000`. |
| `NODE_ENV` | No | Enables development Prisma logging when set to `development`. |
| `JWT_SECRET` | Yes | Signs user access tokens. |
| `JWT_REFRESH_SECRET` | Yes | Signs user refresh tokens. |
| `PAYSTACK_SECRET_KEY` | Yes for payments | Authorizes Paystack API calls. |
| `PAYSTACK_WEBHOOK_SECRET` | No | Verifies Paystack webhook signatures. Defaults to `PAYSTACK_SECRET_KEY`. |
| `PAYMENT_CALLBACK_URL` | No | Callback URL sent to Paystack transaction initialization. |
| `CUSTOMER_EMAIL` | No | Fallback payment customer email when the user/request has none. |
| `ARKASEL_SMS_API_KEY` | Yes for SMS OTP | ArkAsel SMS API key. |
| `ARKASEL_SENDER_ID` | No | SMS sender ID. Defaults to `PentaTech`. |
| `ARKASEL_SMS_URL` | No | SMS API URL. Defaults to ArkAsel's send SMS endpoint. |
| `WHATSAPP_PHONE_NUMBER_ID` | Yes for WhatsApp OTP | Meta WhatsApp phone number ID. |
| `WHATSAPP_ACCESS_TOKEN` | Yes for WhatsApp OTP | Meta Graph API access token. |
| `WHATSAPP_OTP_TEMPLATE_NAME` | Yes for WhatsApp OTP | WhatsApp message template name. |
| `MAIL_HOST` | Yes for email | SMTP host. |
| `MAIL_PORT` | No | SMTP port. Defaults to `465`. |
| `MAIL_ENCRYPTION` | No | Set to `ssl` to enable secure SMTP. |
| `MAIL_USERNAME` | Yes for email | SMTP username. |
| `MAIL_PASSWORD` | Yes for email | SMTP password. |
| `MAIL_FROM_ADDRESS` | Yes for email | Email sender address. |
| `MINIO_ENDPOINT` | Yes for S3 helpers | S3/MinIO endpoint host. |
| `MINIO_ACCESS_KEY` | Yes for S3 helpers | S3/MinIO access key. |
| `MINIO_SECRET_KEY` | Yes for S3 helpers | S3/MinIO secret key. |
| `MINIO_BUCKET_NAME` | Yes for S3 helpers | Public bucket name. |
| `MINIO_PRIVATE_BUCKET_NAME` | Yes for S3 helpers | Private bucket name. |

## Database And Prisma

The Prisma schema lives at `prisma/schema.prisma`. The generated client is
configured with:

```prisma
generator client {
  provider            = "prisma-client"
  output              = "../src/generated/prisma"
  importFileExtension = "js"
}
```

Common local commands:

```bash
npx prisma generate
npx prisma db push
npm run seed
```

`prisma/seed.ts` is currently a placeholder seed script. If config endpoints are
used, add the required seed data for the relevant config tables after the schema
is aligned with the source code.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Starts the TypeScript dev server with `tsx watch src/index.ts`. |
| `npm run build` | Compiles TypeScript with `tsc` into `dist/`. |
| `npm run start` | Runs the compiled server from `dist/index.js`. |
| `npm run test` | Runs Jest with ESM VM module support. |
| `npm run seed` | Runs `tsx prisma/seed.ts`. |
| `npm run seed:app-versions` | Runs the app-version seed runner when the referenced seed files exist. |
| `npm run seed:admin` | Runs the admin seed runner when the referenced seed files exist. |
| `npm run seed:banners` | Runs the banner seed runner when the referenced seed files exist. |

## Project Structure

```text
starter_api/
  prisma/                  Prisma schema and seed entrypoint
  src/
    createApp.ts           Express app factory and route mounting
    index.ts               HTTP server entrypoint
    features/
      config/              Public config and app-version endpoints
      users/
        authentication/    User registration, OTP, social auth, profile APIs
        notification/      Push token and notification APIs
        payments/          Paystack payment APIs
    middleware/
      common/              Rate limiting and upload middleware
      users/               User JWT authentication middleware
    services/
      paystack/            Paystack API client and types
    utils/                 Tokens, OTP, email, SMS, WhatsApp, S3, validators
```

Add new business areas under `src/features/<domain>`. Keep HTTP routing in a
`*.routes.ts` file, request handling in a controller, shared logic in services
or utils, and mount the router in `src/createApp.ts`.

## API Surface

The app mounts these route groups:

- `/user/api/v1/auth`
- `/user/api/v1/payments`
- `/user/api/v1/notifications`
- `/user/api/v1/config`
- `/payment/callback`
- `/`

See [API_REFERENCE.md](./API_REFERENCE.md) for endpoint details, request body
examples, authentication requirements, and representative responses.

## Security And Rate Limiting

- User-protected routes use `Authorization: Bearer <accessToken>`.
- `helmet()` is enabled globally.
- CORS is currently open with `origin: "*"`.
- `/api` has a general limiter, and auth/OTP routes have stricter endpoint
  limiters.
- Paystack webhook requests preserve the raw request body before JSON parsing so
  signatures can be validated.

Additional notes live in:

- [SECURITY.md](./SECURITY.md)
- [RATE_LIMITING_SUMMARY.md](./RATE_LIMITING_SUMMARY.md)

## Docker

Build and run with Docker Compose:

```bash
docker compose up --build
```

The compose file builds this package and maps host port `3000` to container port
`3000`. It reads environment variables from `.env`.

## Current Caveats

This starter pack currently needs a schema/dependency cleanup before the TypeScript
build is fully green.

Known `npx tsc --noEmit` issues observed on 2026-06-16:

- AWS SDK type declaration errors from the installed S3 package set, including
  missing flexible checksum exports and missing S3 client configuration types.
- Prisma schema/client mismatch. Source code references Prisma models that are
  not present in `prisma/schema.prisma` or the generated source client:
  `DeviceToken`, `PlatformConfig`, and `AppVersion`.
- Notification code depends on `prisma.deviceToken`.
- Config code depends on `prisma.platformConfig` and `prisma.appVersion`.

Until those are resolved, use the docs as an onboarding map and treat affected
routes as requiring schema alignment before production use.

## Troubleshooting

- `DATABASE_URL environment variable is not set`: add `DATABASE_URL` to `.env`.
- `PAYSTACK_SECRET_KEY is required`: payment routes import the Paystack service,
  so set the key when payments are enabled.
- OTP send failures: check ArkAsel and WhatsApp environment variables. OTP
  channel delivery failures are logged independently.
- Config route returns missing config data: add and seed the platform config and
  app-version tables once their Prisma models exist.
- Push notification routes fail at compile time: add the `DeviceToken` Prisma
  model and regenerate the Prisma client.
