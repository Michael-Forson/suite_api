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
  "email": "ama@example.com",
  "googleId": "google-user-id"
}
```

Success:

```json
{
  "success": true,
  "message": "Google authentication successful",
  "data": {
    "user": {
      "id": "1",
      "email": "ama@example.com",
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
PATCH /user/api/v1/organizations/:id/profile
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
PATCH /user/api/v1/organizations/:id/status
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
GET /user/api/v1/organizations/:id
```

Returns the organization, the current user's membership, and counts for members,
apps, and roles. The user must belong to the organization.

### List User Organizations

```http
GET /user/api/v1/organizations
```

Returns organizations the authenticated user owns or belongs to as an active
member.

## Organization Member Endpoints

Mounted at `/user/api/v1/organizations`.

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

Mounted at `/user/api/v1/organizations`.

### Create Staff Invitation

```http
POST /user/api/v1/organizations/:organizationId/invitations
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

### Send Invitation Email

```http
POST /user/api/v1/organizations/:organizationId/invitations/:invitationId/send-email
Authorization: Bearer <accessToken>
```

Sends the `App_Organization_Invitation` email using `INVITATION_ACCEPT_URL`.

### Validate Invitation Token

```http
GET /user/api/v1/organizations/:organizationId/invitations/validate/:token
```

Returns safe invitation details when the token is pending and unexpired.

### Accept Invitation

```http
POST /user/api/v1/organizations/:organizationId/invitations/accept
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
PATCH /user/api/v1/organizations/:organizationId/invitations/expire-old
Authorization: Bearer <accessToken>
```

Marks pending expired invitations as `EXPIRED`.

### Revoke Invitation

```http
PATCH /user/api/v1/organizations/:organizationId/invitations/:invitationId/revoke
Authorization: Bearer <accessToken>
```

Marks a pending invitation as `REVOKED`.

### Resend Invitation

```http
POST /user/api/v1/organizations/:organizationId/invitations/:invitationId/resend
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
