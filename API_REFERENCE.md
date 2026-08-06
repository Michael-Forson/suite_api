# Starter API Reference

Base URL for local development:

```text
http://localhost:3000
```

Most JSON responses follow this shape:

```json
{
  "success": true,
  "message": "Optional message",
  "data": {}
}
```

Errors generally use:

```json
{
  "success": false,
  "message": "What went wrong"
}
```

The global Express error handler may also return:

```json
{
  "error": "Internal server error"
}
```

## Authentication

Protected user routes require:

```http
Authorization: Bearer <accessToken>
```

Access and refresh tokens are returned after a successful phone verification or
social sign-in.

## Auth Endpoints

Mounted at `/user/api/v1/auth`.

### Register User

```http
POST /user/api/v1/auth/register
Content-Type: application/json
```

Body:

```json
{
  "firstName": "Ama",
  "lastName": "Mensah",
  "phone": "233241234567",
  "email": "ama@example.com",
  "gender": "FEMALE",
  "dob": "1998-03-12"
}
```

Notes:

- `firstName`, `lastName`, and `phone` are required.
- `gender` must be `MALE`, `FEMALE`, or `OTHER` when provided.
- `email`, `phone`, and `dob` are validated.

Success:

```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "id": "1",
    "firstName": "Ama",
    "lastName": "Mensah",
    "email": "ama@example.com",
    "phone": "233241234567",
    "authProvider": "EMAIL",
    "isActive": true
  }
}
```

### Send Phone Verification Code

```http
POST /user/api/v1/auth/send-phone-code
Content-Type: application/json
```

Body:

```json
{
  "phone": "233241234567",
  "type": "ACTIVATION",
  "channel": "both"
}
```

Notes:

- `phone` is required.
- `type` can be `ACTIVATION` or `LOGIN`.
- `channel` can be `sms`, `whatsapp`, or `both`.
- `LOGIN` requires an existing user.
- Password reset codes use `/password-reset/request`.

Success:

```json
{
  "success": true,
  "message": "Verification code sent"
}
```

### Verify Phone Code

```http
POST /user/api/v1/auth/verify-phone-code
Content-Type: application/json
```

Body:

```json
{
  "phone": "233241234567",
  "code": "123456",
  "type": "ACTIVATION"
}
```

Notes:

- `code` must be 6 digits.
- This endpoint accepts optional bearer auth. When a social-auth user is
  authenticated, activation verification can link that social account to an
  existing phone account.

Success:

```json
{
  "success": true,
  "message": "Phone number verified successfully",
  "data": {
    "user": {
      "id": "1",
      "phone": "233241234567",
      "phoneVerifiedAt": "2026-06-16T00:00:00.000Z"
    },
    "tokens": {
      "accessToken": "<jwt>",
      "refreshToken": "<jwt>"
    }
  }
}
```

### Send Email Verification Code

```http
POST /user/api/v1/auth/send-verification-email
Authorization: Bearer <accessToken>
Content-Type: application/json
```

Body:

```json
{
  "email": "ama@example.com"
}
```

Success:

```json
{
  "success": true,
  "message": "Verification code sent to your email"
}
```

### Verify Email Code

```http
POST /user/api/v1/auth/verify-email
Authorization: Bearer <accessToken>
Content-Type: application/json
```

Body:

```json
{
  "email": "ama@example.com",
  "code": "123456"
}
```

Success:

```json
{
  "success": true,
  "message": "Email verified successfully"
}
```

### Refresh Token

```http
POST /user/api/v1/auth/refresh-token
Content-Type: application/json
```

Body:

```json
{
  "refreshToken": "<refreshToken>"
}
```

Success:

```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "tokens": {
      "accessToken": "<jwt>",
      "refreshToken": "<jwt>"
    }
  }
}
```

### Continue With Google

```http
POST /user/api/v1/auth/continue-with-google
Content-Type: application/json
```

Body:

```json
{
  "idToken": "<google-id-token>"
}
```

`idToken` is the credential returned by Google Identity Services on the frontend. The backend
verifies it server-side against `GOOGLE_CLIENT_ID` and derives the user's email/name/Google ID
from the verified token — it does not trust any email/googleId sent in the request body.

Success:

```json
{
  "success": true,
  "message": "Google authentication successful",
  "data": {
    "user": {
      "id": "1",
      "firstName": "Ama",
      "lastName": "Owusu",
      "email": "ama@example.com",
      "phone": null,
      "gender": null,
      "dob": null,
      "emailVerifiedAt": "2026-07-11T00:00:00.000Z",
      "phoneVerifiedAt": null,
      "isActive": true,
      "authProvider": "GOOGLE"
    },
    "tokens": {
      "accessToken": "<jwt>",
      "refreshToken": "<jwt>"
    }
  }
}
```

### Continue With Apple

```http
POST /user/api/v1/auth/continue-with-apple
Content-Type: application/json
```

Body:

```json
{
  "appleId": "apple-user-id",
  "email": "ama@example.com",
  "firstName": "Ama",
  "lastName": "Mensah"
}
```

Success:

```json
{
  "success": true,
  "message": "Apple authentication successful",
  "data": {
    "user": {
      "id": "1",
      "email": "ama@example.com",
      "authProvider": "APPLE"
    },
    "tokens": {
      "accessToken": "<jwt>",
      "refreshToken": "<jwt>"
    }
  }
}
```

### Get Current User

```http
GET /user/api/v1/auth/me
Authorization: Bearer <accessToken>
```

Success:

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "1",
      "firstName": "Ama",
      "lastName": "Mensah",
      "email": "ama@example.com",
      "phone": "233241234567",
      "authProvider": "PHONE",
      "isActive": true
    }
  }
}
```

### Update Profile

```http
PATCH /user/api/v1/auth/profile
Authorization: Bearer <accessToken>
Content-Type: application/json
```

Body:

```json
{
  "firstName": "Ama",
  "lastName": "Owusu",
  "phone": "233241234567",
  "email": "ama@example.com",
  "gender": "FEMALE",
  "dob": "1998-03-12"
}
```

Success:

```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "id": "1",
    "firstName": "Ama",
    "lastName": "Owusu"
  }
}
```

### Delete Account

```http
DELETE /user/api/v1/auth/account
Authorization: Bearer <accessToken>
```

Success:

```json
{
  "success": true,
  "message": "Your account has been deleted. We're sorry to see you go."
}
```

## Organization Endpoints

Mounted at `/user/api/v1/organizations`.

All organization routes require:

```http
Authorization: Bearer <accessToken>
```

### Create Organization

```http
POST /user/api/v1/organizations
Content-Type: application/json
```

Body:

```json
{
  "name": "Ama Foods",
  "slug": "ama-foods",
  "businessType": "Limited Liability Company",
  "industry": "Food Services",
  "email": "hello@amafoods.example",
  "phone": "233241234567",
  "country": "Ghana",
  "city": "Accra",
  "address": "12 Market Street"
}
```

Notes:

- `name` is required.
- `slug` is optional and generated from `name` when omitted.
- The provided `slug` or generated slug must contain letters or numbers.
- The creator is added as an active `OWNER` member.

### Update Organization Profile

```http
PATCH /user/api/v1/organizations/:organizationId/profile
Content-Type: application/json
```

Body:

```json
{
  "name": "Ama Foods Ltd",
  "industry": "Retail",
  "email": "support@amafoods.example",
  "phone": "233241234567",
  "city": "Kumasi"
}
```

Notes:

- Organization owners and admins can update profile fields.
- Optional profile fields can be set to `null`.
- `slug`, `email`, and `phone` are validated when provided.

### Change Organization Status

```http
PATCH /user/api/v1/organizations/:organizationId/status
Content-Type: application/json
```

Body:

```json
{
  "status": "ACTIVE"
}
```

Notes:

- Only the organization owner can change status.
- `status` must be `ACTIVE`, `INACTIVE`, `SUSPENDED`, or `DISABLED`.

### Get Organization Details

```http
GET /user/api/v1/organizations/:organizationId
```

Returns the organization, the current user's membership, and counts for members
and enabled apps. App roles are global app definitions rather than
organization-owned records. The user must belong to the organization.

### List User Organizations

```http
GET /user/api/v1/organizations
```

Returns organizations the authenticated user owns or belongs to as an active
member.

## App Registry Endpoints

Mounted at `/user/api/v1/apps`.

All app registry routes require:

```http
Authorization: Bearer <accessToken>
```

### List Available Apps

```http
GET /user/api/v1/apps
```

Returns active apps only. Disabled apps are never exposed through the user API.

### Get App Details

```http
GET /user/api/v1/apps/:key
```

Returns active app details by app key, including counts for organization access,
permissions, and roles.

## Super-Admin Endpoints

Mounted at `/super-admin/api/v1`. Super-admin access and refresh JWTs use
`type: "super-admin"` and cannot be replaced by business-user JWTs.

### Super-Admin Authentication

```http
POST /super-admin/api/v1/auth/login
POST /super-admin/api/v1/auth/refresh
GET  /super-admin/api/v1/auth/me

POST /super-admin/api/v1/auth/password/forgot
GET  /super-admin/api/v1/auth/password/token/:token
POST /super-admin/api/v1/auth/password/set
```

Login accepts `email` and `password`. Refresh accepts `refreshToken`. Protected
routes require `Authorization: Bearer <superAdminAccessToken>`.

The three `password/*` routes are **public** — they exist for callers with no
session. `forgot` accepts `email` and always answers the same whether or not the
account exists, so it cannot be used to enumerate super-admins; an account still
in `INVITED` is sent a fresh invitation instead of a reset. `token/:token`
resolves a link without spending it, returning `type`, `email` and `firstName`.
`set` accepts `token` and `password`, spends the link, and moves an `INVITED`
account to `ACTIVE`. Invitation links last 72 hours, reset links 1 hour, and
both are single-use.

### Manage Super-Admin Accounts

```http
GET   /super-admin/api/v1/accounts
POST  /super-admin/api/v1/accounts
POST  /super-admin/api/v1/accounts/:superAdminId/resend-invite
POST  /super-admin/api/v1/accounts/:superAdminId/send-password-reset
PATCH /super-admin/api/v1/accounts/:superAdminId
PATCH /super-admin/api/v1/accounts/:superAdminId/status
```

**The root super-admin** is whichever account holds the address in
`SUPER_ADMIN_EMAIL`. It is derived from the environment on every request, never
stored, and returned as `isRoot` on every serialized super-admin. Only root may
invite, resend, send reset links, change status, or edit another account; every
other super-admin has read access to the list and may edit only their own
profile. Root cannot be disabled by anyone, including itself.

`POST /accounts` **invites** — it accepts `firstName`, `lastName` and `email`,
and never a password. The account is created as `INVITED` with a null password
and is mailed a link to set their own; it becomes `ACTIVE` only when they do.
The response carries `emailSent`, because the account still exists when SMTP
fails and the fix is to resend. Requires `SUPER_ADMIN_PASSWORD_SETUP_URL`.

Statuses are `ACTIVE`, `DISABLED` and `INVITED`. Only `ACTIVE` and `DISABLED`
are assignable — `INVITED` is left by setting a password and no other way, and
the status route rejects a change on an invited account. At least one active
super-admin must remain. Passwords require at least 12 characters. A super-admin
may change only their own password and must provide `currentPassword`; root
mails a reset link rather than setting anyone's password.

### Manage Apps

```http
GET /super-admin/api/v1/apps
POST /super-admin/api/v1/apps
GET /super-admin/api/v1/apps/:key
PATCH /super-admin/api/v1/apps/:key/details
PATCH /super-admin/api/v1/apps/:key/status
```

Authenticated super-admin accounts can manage apps — this is platform
configuration, so it is not restricted to the root super-admin. New apps default
to `DISABLED`.

App keys are unique, permanent, and normalized on the way in and on lookup:
trimmed, lowercased, and restricted to `^[a-z0-9][a-z0-9._:-]*$`, 100 characters
or fewer — the same rule as permission and role keys. The key is a URL path
segment in every route that touches the app, so `Inventory`, ` inventory ` and
`inventory` all address the same record, and a key containing `/` or a space is
rejected with 400 rather than stored unreachable.

`PATCH /:key/details` updates `name`, `description`, `iconUrl` and `appUrl` only;
sending `key` is a 400 and sending `status` is ignored — status has its own
route. There is no delete endpoint; deactivation is `status: DISABLED`.

**App icons.** `POST /apps` and `PATCH /:key/details` accept either JSON or
`multipart/form-data` carrying an `icon` image file, with the remaining fields as
a JSON string in a `data` field. The image is stored in the public bucket under
`app-icons/`, so clients never send a URL themselves. Images only, 5 MB maximum —
a rejected upload is a 400, and a storage failure is a 502. An uploaded file takes
precedence over any `iconUrl` in the body; sending `iconUrl: null` clears the
icon. Replacing or clearing deletes the previous object after the row is updated.
Requires `AWS_ENDPOINT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and
`PUBLIC_BUCKET_NAME`.

Responses always carry `iconUrl`, an absolute URL. The column behind it stores
only the object key: the endpoint is deployment config, so composing the URL on
read means adding TLS, moving hosts or putting a CDN in front is an env change
rather than a rewrite of every row. A value that already carries a scheme —
an icon registered before uploads existed, or a row predating this change — is
returned as-is, so both forms keep resolving.

### Manage App Permissions

```http
GET   /super-admin/api/v1/apps/:appKey/permissions
POST  /super-admin/api/v1/apps/:appKey/permissions
PATCH /super-admin/api/v1/apps/:appKey/permissions/:permissionKey
PATCH /super-admin/api/v1/apps/:appKey/permissions/:permissionKey/status
```

Permission creation accepts `key`, `label`, optional `description`, and optional
`category`. Keys are normalized to lowercase and cannot be changed. Status is
`ACTIVE` or `DISABLED`; disabled permissions stop granting access immediately.

### Manage Standard App Roles

```http
GET   /super-admin/api/v1/apps/:appKey/roles
POST  /super-admin/api/v1/apps/:appKey/roles
PATCH /super-admin/api/v1/apps/:appKey/roles/:roleKey
PUT   /super-admin/api/v1/apps/:appKey/roles/:roleKey/permissions
PATCH /super-admin/api/v1/apps/:appKey/roles/:roleKey/default
PATCH /super-admin/api/v1/apps/:appKey/roles/:roleKey/status
```

Role creation accepts `key`, `name`, optional `description`, and an optional
`permissionKeys` array. Replacing permissions also uses `permissionKeys`. Role
keys cannot be changed. Only active permissions may be assigned. Each app may
have one default role, and that role must be replaced before it can be disabled.
All changes affect organization access immediately.

## Organization App Access Endpoints

Mounted at `/user/api/v1/organizations/:organizationId/apps`.

All organization app routes require:

```http
Authorization: Bearer <accessToken>
```

### List Organization Apps

```http
GET /user/api/v1/organizations/:organizationId/apps
```

Returns active app access records for active organization members. Results only
include records where both `organization_apps.status` and `apps.status` are
`ACTIVE`.

App access is not enabled or disabled by organization owners through this API.
Subscription/payment-controlled access will be added later.

### Standard Roles and Member Assignments

```http
GET    /user/api/v1/organizations/:organizationId/apps/:appKey/roles
PUT    /user/api/v1/organizations/:organizationId/apps/:appKey/members/:memberId/role
DELETE /user/api/v1/organizations/:organizationId/apps/:appKey/members/:memberId/role
GET    /user/api/v1/organizations/:organizationId/apps/:appKey/my-access
```

Owners and admins can list active standard roles and assign one role to an
active regular member. The assignment body is `{ "roleKey": "staff" }`.
Removing an assignment makes the member fall back to the app's active default
role. Regular members cannot manage assignments.

`my-access` returns the effective role, access source, active permission keys,
and whether organization-role bypass applies. Organization owners and admins
have all active app permissions. Regular members use an active explicit role,
then the active default role; access is unavailable when neither exists.

Application routes can enforce a permission using the reusable
`requireAppPermission("permission.key")` middleware. It also requires active
user, organization, membership, app, and organization-app access.

## Organization Member Endpoints

Mounted at `/user/api/v1/organizations/:organizationId/members`.

All member management routes require:

```http
Authorization: Bearer <accessToken>
```

### List Organization Members

```http
GET /user/api/v1/organizations/:organizationId/members
```

Returns organization members with basic user profile fields. Owners and admins
can list members.

### Update Member Job Title

```http
PATCH /user/api/v1/organizations/:organizationId/members/:memberId/job-title
Content-Type: application/json
```

Body:

```json
{
  "jobTitle": "Operations Manager"
}
```

### Change Member Role

```http
PATCH /user/api/v1/organizations/:organizationId/members/:memberId/role
Content-Type: application/json
```

Body:

```json
{
  "organizationRole": "ADMIN"
}
```

Notes:

- Role must be `ADMIN` or `MEMBER`.
- The owner cannot be demoted through this endpoint.
- Admins can only manage regular members.

### Change Member Status

```http
PATCH /user/api/v1/organizations/:organizationId/members/:memberId/status
Content-Type: application/json
```

Body:

```json
{
  "status": "SUSPENDED"
}
```

Notes:

- Status must be `ACTIVE`, `INACTIVE`, or `SUSPENDED`.
- The owner cannot be disabled or suspended through this endpoint.

### Remove Member

```http
DELETE /user/api/v1/organizations/:organizationId/members/:memberId
```

Deletes the member record. The owner cannot be removed, and admins cannot remove
owners or other admins.

## Organization Invitation Endpoints

Mounted at `/user/api/v1/organizations/:organizationId/invites`.

### Create Staff Invitation

```http
POST /user/api/v1/organizations/:organizationId/invites
Authorization: Bearer <accessToken>
Content-Type: application/json
```

Body:

```json
{
  "email": "staff@example.com",
  "organizationRole": "MEMBER"
}
```

Notes:

- Owners can invite `ADMIN` or `MEMBER` staff.
- Admins can invite `MEMBER` staff only.
- Creates a 7-day pending invitation and returns the token/link.
- The returned `invitationLink` carries both `token` and `organizationId`, since
  the validate and accept endpoints are scoped to `:organizationId`.

### List Invitations

```http
GET /user/api/v1/organizations/:organizationId/invites?status=PENDING
Authorization: Bearer <accessToken>
```

Notes:

- Owner/admin only.
- Optional `status` filter: `PENDING`, `ACCEPTED`, `EXPIRED`, `REVOKED`.
- Flips stale pending invitations to `EXPIRED` before returning, so the list
  never disagrees with what the accept endpoint would do.
- Each entry omits the raw `token` and exposes `invitationLink` instead.

### Send Invitation Email

```http
POST /user/api/v1/organizations/:organizationId/invites/:invitationId/send-email
Authorization: Bearer <accessToken>
```

Sends the `App_Organization_Invitation` email using `INVITATION_ACCEPT_URL`.

### Validate Invitation Token

```http
GET /user/api/v1/organizations/:organizationId/invites/validate/:token
```

Returns safe invitation details when the token is pending and unexpired.

### Accept Invitation

```http
POST /user/api/v1/organizations/:organizationId/invites/accept
Authorization: Bearer <accessToken>
Content-Type: application/json
```

Body:

```json
{
  "token": "64-character-random-token"
}
```

The authenticated user's email must match the invitation email.

### Expire Old Invitations

```http
PATCH /user/api/v1/organizations/:organizationId/invites/expire-old
Authorization: Bearer <accessToken>
```

Marks pending expired invitations as `EXPIRED`.

### Revoke Invitation

```http
PATCH /user/api/v1/organizations/:organizationId/invites/:invitationId/revoke
Authorization: Bearer <accessToken>
```

Marks a pending invitation as `REVOKED`.

### Resend Invitation

```http
POST /user/api/v1/organizations/:organizationId/invites/:invitationId/resend
Authorization: Bearer <accessToken>
```

Refreshes the token and expiry, then sends the invitation email again.

## Payment Endpoints

Mounted at `/user/api/v1/payments`.

### Initialize Payment

```http
POST /user/api/v1/payments/initialize
Authorization: Bearer <accessToken>
Content-Type: application/json
```

Body:

```json
{
  "amount": 25.5,
  "email": "ama@example.com",
  "metadata": {
    "orderId": "order-123"
  }
}
```

Notes:

- `amount` must be a positive number.
- Amount is interpreted as GHS and converted to pesewas for Paystack.
- `email` is optional if the authenticated user has an email or
  `CUSTOMER_EMAIL` is configured.

Success:

```json
{
  "success": true,
  "message": "Payment initialized successfully",
  "data": {
    "authorizationUrl": "https://checkout.paystack.com/...",
    "accessCode": "access-code",
    "reference": "paystack-reference",
    "transactionId": "1"
  }
}
```

### Verify Payment

```http
GET /user/api/v1/payments/verify/:reference
Authorization: Bearer <accessToken>
```

Success:

```json
{
  "success": true,
  "message": "Payment verification successful",
  "data": {
    "reference": "paystack-reference",
    "status": "success",
    "amount": 25.5,
    "currency": "GHS",
    "paidAt": "2026-06-16T00:00:00.000Z",
    "transactionId": "1"
  }
}
```

### Check Payment Status

```http
GET /user/api/v1/payments/check-status/:reference
Authorization: Bearer <accessToken>
```

Success:

```json
{
  "success": true,
  "data": {
    "paymentStatus": "success",
    "reference": "paystack-reference",
    "transactionId": "1"
  }
}
```

### Paystack Webhook

```http
POST /user/api/v1/payments/paystack/webhook
X-Paystack-Signature: <signature>
Content-Type: application/json
```

Body:

```json
{
  "event": "charge.success",
  "data": {
    "reference": "paystack-reference",
    "status": "success",
    "currency": "GHS",
    "amount": 2550,
    "channel": "card",
    "paid_at": "2026-06-16T00:00:00.000Z"
  }
}
```

Notes:

- The webhook route is intentionally mounted before JSON middleware so the raw
  body can be used for signature verification.
- The header name is `x-paystack-signature`.

Success:

```json
{
  "success": true,
  "message": "Webhook processed successfully"
}
```

## Notification Endpoints

Mounted at `/user/api/v1/notifications`.

Current caveat: these routes depend on a `DeviceToken` Prisma model that is not
present in the current source schema.

### Register Push Token

```http
POST /user/api/v1/notifications/push-token
Authorization: Bearer <accessToken>
Content-Type: application/json
```

Body:

```json
{
  "pushToken": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
  "platform": "ios"
}
```

Success:

```json
{
  "success": true,
  "message": "Device token registered",
  "data": {
    "id": "1",
    "userId": "1",
    "pushToken": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
    "platform": "ios"
  }
}
```

### Remove Push Token

```http
DELETE /user/api/v1/notifications/push-token
Authorization: Bearer <accessToken>
Content-Type: application/json
```

Body:

```json
{
  "pushToken": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
}
```

Success:

```json
{
  "success": true,
  "message": "Device token removed."
}
```

### Send Test Notification

```http
POST /user/api/v1/notifications/send-test
Content-Type: application/json
```

Body:

```json
{
  "title": "Test",
  "body": "This is a test notification.",
  "metadata": {
    "source": "api-reference"
  }
}
```

Important: the route is currently not protected by `authenticate`, but the
controller expects `req.userId`. As written, it returns `401` unless another
middleware supplies a user ID.

### List Notifications

```http
GET /user/api/v1/notifications
Authorization: Bearer <accessToken>
```

Success:

```json
{
  "success": true,
  "data": [
    {
      "id": "1",
      "userId": "1",
      "title": "Order update",
      "message": "Your order is on the way.",
      "type": "general",
      "metadata": {},
      "readAt": null,
      "createdAt": "2026-06-16T00:00:00.000Z"
    }
  ]
}
```

Notes:

- Returns notifications from the last 21 days.
- Includes direct user notifications and global notifications with audience
  `USER` or `ALL`.

### Mark Notification As Read

```http
PATCH /user/api/v1/notifications/:id/read
Authorization: Bearer <accessToken>
```

Success:

```json
{
  "success": true,
  "message": "Notification marked as read"
}
```

### Mark All Notifications As Read

```http
PATCH /user/api/v1/notifications/read-all
Authorization: Bearer <accessToken>
```

Success:

```json
{
  "success": true,
  "message": "All notifications marked as read"
}
```

## Config Endpoints

Mounted at `/user/api/v1/config`.

Current caveat: these routes depend on `PlatformConfig` and `AppVersion` Prisma
models that are not present in the current source schema.

### Get Platform Config

```http
GET /user/api/v1/config
```

Success:

```json
{
  "success": true,
  "data": {
    "serviceFeePercent": 5,
    "serviceFeeCap": 10,
    "taxRate": 0.15
  }
}
```

### Get App Version

```http
GET /user/api/v1/config/app-version?platform=android&app=user
```

Query parameters:

| Name | Required | Values |
| --- | --- | --- |
| `platform` | Yes | `ios`, `android` |
| `app` | Yes | `user` |

Success:

```json
{
  "success": true,
  "data": {
    "latestVersion": "1.0.0",
    "minimumVersion": "1.0.0",
    "storeUrl": "https://example.com/app",
    "updateMessage": "A new version is available.",
    "forceMessage": "Please update to continue."
  }
}
```

## Miscellaneous Routes

### Payment Callback

```http
GET /payment/callback?reference=:reference
```

Returns a simple HTML page saying the payment was received and the window can be
closed.

### Root

```http
GET /
```

Returns a simple HTML page saying the window can be closed.

## Common Status Codes

| Status | Meaning |
| --- | --- |
| `200` | Request succeeded. |
| `201` | Resource or session created, such as registration or verification. |
| `400` | Missing or invalid request input. |
| `401` | Missing, invalid, expired, or wrong-type token. |
| `403` | Account is deactivated or access is blocked. |
| `404` | User, transaction, version, or other resource was not found. |
| `409` | Unique email/phone conflict or account-linking conflict. |
| `429` | Rate limit or verification attempt limit reached. |
| `500` | Unexpected server error. |
