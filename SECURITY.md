# Security Features

This document outlines the security measures implemented in the CHO API to protect against common attacks.

## Rate Limiting

### Overview
The API uses `express-rate-limit` to prevent abuse and protect against various attacks including:
- SMS bombing attacks
- Brute force verification code attempts
- Credential stuffing
- Mass account creation
- General API abuse

### Implemented Rate Limiters

#### 1. General API Rate Limiter
**Applied to:** All `/api/*` routes
**Window:** 15 minutes
**Limit:** 100 requests per IP
**Purpose:** Prevent general API abuse

```typescript
// Location: src/middleware/rateLimiter.middleware.ts
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: "Too many requests from this IP, please try again later."
});
```

#### 2. SMS Rate Limiter (IP-based)
**Applied to:** `POST /api/v1/auth/send-code`
**Window:** 1 hour
**Limit:** 5 SMS requests per IP
**Purpose:** Prevent SMS bombing from a single IP

```typescript
export const smsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: "Too many SMS verification requests. Please try again after an hour."
});
```

#### 3. SMS Rate Limiter (Identifier-based)
**Applied to:** `POST /api/v1/auth/send-code`
**Window:** 1 hour
**Limit:** 3 SMS per phone/email
**Purpose:** Prevent SMS bombing to a specific phone number or email

```typescript
export const smsPerIdentifierLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  keyGenerator: (req) => req.body.phone || req.body.email || req.ip || "unknown",
  message: "Too many verification codes sent to this contact. Please try again after an hour."
});
```

**Note:** Both SMS limiters are applied together, providing double protection.

#### 4. Verification Code Attempt Limiter
**Applied to:** `POST /api/v1/auth/verify-code`
**Window:** 15 minutes
**Limit:** 5 attempts per IP
**Purpose:** Prevent brute force attacks on verification codes
**Special:** Only counts failed attempts (skipSuccessfulRequests: true)

```typescript
export const verifyCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  skipSuccessfulRequests: true,
  message: "Too many verification attempts. Please try again after 15 minutes."
});
```

#### 5. Login/Refresh Token Limiter
**Applied to:** `POST /api/v1/auth/refresh-token`
**Window:** 15 minutes
**Limit:** 10 attempts per IP
**Purpose:** Prevent token refresh abuse

```typescript
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  skipSuccessfulRequests: true,
  message: "Too many login attempts. Please try again after 15 minutes."
});
```

#### 6. Registration Limiter
**Applied to:** `POST /api/v1/auth/register`
**Window:** 1 hour
**Limit:** 3 registrations per IP
**Purpose:** Prevent mass account creation

```typescript
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: "Too many accounts created from this IP. Please try again after an hour."
});
```

## Database-Level Verification Attempt Tracking

### Overview
In addition to rate limiting, the API tracks verification attempts in the database to provide persistent, fine-grained protection against brute force attacks.

### Implementation

**Database Model:** `VerificationAttempt`
```prisma
model VerificationAttempt {
  id          BigInt   @id @default(autoincrement())
  identifier  String   @db.VarChar(255) // Email or Phone
  ipAddress   String   @map("ip_address") @db.VarChar(45)
  attempts    Int      @default(1)
  lastAttempt DateTime @default(now()) @map("last_attempt")
  createdAt   DateTime @default(now()) @map("created_at")

  @@unique([identifier, ipAddress])
  @@index([identifier])
  @@index([ipAddress])
  @@index([lastAttempt])
}
```

**Tracking Logic:**
- **Window:** 60 minutes (rolling)
- **Max Attempts:** 10 per identifier+IP combination
- **Reset:** Automatically resets after successful verification
- **Cleanup:** Old records (>24 hours) should be cleaned periodically

**Location:** `src/utils/verificationAttempts.ts`

### How It Works

1. **Before verification:**
   ```typescript
   const attemptCheck = await trackVerificationAttempt(identifier, ipAddress);
   if (!attemptCheck.allowed) {
     return res.status(429).json({
       message: "Too many verification attempts. Please try again later."
     });
   }
   ```

2. **After successful verification:**
   ```typescript
   await resetVerificationAttempts(identifier, ipAddress);
   ```

## JWT Token Security

### Token Expiration
- **Access Token:** 1 minute (for testing) / 24 hours (production recommended)
- **Refresh Token:** 3 days

### Token Refresh Mechanism
- Mobile app automatically refreshes expired tokens
- Backend logs token expiration as info (not error)
- Users remain logged in seamlessly

### Token Verification
- **Stateful verification:** Checks if user exists in database
- **Active account check:** Verifies `isActive` flag
- **Signature validation:** Uses JWT_SECRET environment variable

**Location:** `src/middleware/auth.middleware.ts`

## Security Headers

Rate limit information is returned in response headers:
- `RateLimit-Limit`: Maximum requests allowed
- `RateLimit-Remaining`: Remaining requests in window
- `RateLimit-Reset`: Time when the window resets

## Attack Scenarios & Protections

### SMS Bombing Attack
**Attack:** Attacker tries to flood a phone number with verification codes

**Protection Layers:**
1. ✅ IP-based SMS limiter: Max 5 SMS per hour per IP
2. ✅ Identifier-based SMS limiter: Max 3 SMS per hour per phone
3. ✅ General API limiter: Max 100 requests per 15 min

**Result:** Attacker blocked after 3-5 attempts

---

### Brute Force Verification Code
**Attack:** Attacker tries to guess 4-digit verification codes

**Protection Layers:**
1. ✅ Rate limiter: Max 5 verification attempts per 15 min per IP
2. ✅ Database tracking: Max 10 attempts per hour per phone+IP
3. ✅ Code expiration: Codes expire after 15 minutes
4. ✅ One-time use: Codes are deleted after successful use

**Result:** With 4-digit codes (10,000 possibilities), attacker can only try 5-10 codes before being blocked

---

### Mass Account Creation
**Attack:** Attacker creates many fake accounts

**Protection Layers:**
1. ✅ Registration limiter: Max 3 accounts per hour per IP
2. ✅ Phone verification required: Must verify phone before activation
3. ✅ Unique phone constraint: Same phone can't register twice

**Result:** Attacker limited to 3 accounts per hour per IP

---

### Credential Stuffing
**Attack:** Attacker tries many username/password combinations

**Protection Layers:**
1. ✅ Login limiter: Max 10 failed logins per 15 min per IP
2. ✅ Refresh token limiter: Max 10 token refresh attempts per 15 min
3. ✅ General API limiter: Max 100 requests per 15 min

**Result:** Attacker blocked after 10 attempts

---

### Token Expiration Attacks
**Attack:** Attacker tries to use expired tokens

**Protection:**
1. ✅ JWT expiration validation
2. ✅ Stateful user verification (checks DB)
3. ✅ Active account check
4. ✅ Automatic token refresh on mobile (prevents user disruption)

**Result:** Expired tokens rejected, but legitimate users stay logged in via refresh

## Recommendations for Production

### 1. Adjust Token Expiration
Change access token expiration from 1 minute (testing) to production value:

```typescript
// src/utils/tokens.ts
export const generateAccessToken = (id: any) => {
  return jwt.sign({ id: id.toString() }, process.env.JWT_SECRET!, {
    expiresIn: "24h", // Change from "1m" to "24h" or "7d"
  });
};
```

### 2. Enable Trust Proxy
If running behind a reverse proxy (nginx, AWS ALB, etc.), enable trust proxy:

```typescript
// src/createApp.ts
app.set('trust proxy', 1);
```

This ensures rate limiters use the real client IP, not the proxy IP.

### 3. Implement Cleanup Cron Job
Schedule periodic cleanup of old verification attempts:

```typescript
// Example using node-cron
import cron from 'node-cron';
import { cleanupOldAttempts } from './utils/verificationAttempts';

// Run every day at 3 AM
cron.schedule('0 3 * * *', async () => {
  const deleted = await cleanupOldAttempts();
  console.log(`Cleaned up ${deleted} old verification attempts`);
});
```

### 4. Monitor Rate Limit Violations
Add monitoring/alerting when rate limits are hit frequently:

```typescript
// Custom handler example
const monitorRateLimits = (req, res, next) => {
  if (req.rateLimit.remaining === 0) {
    console.warn('Rate limit hit:', {
      ip: req.ip,
      endpoint: req.path,
      timestamp: new Date()
    });
    // Send to monitoring service (Sentry, DataDog, etc.)
  }
  next();
};
```

### 5. Restrict CORS in Production
Update CORS settings to only allow your frontend domain:

```typescript
// src/createApp.ts
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "https://yourapp.com",
    credentials: true,
  })
);
```

### 6. Add HTTPS Enforcement
Ensure all requests use HTTPS in production:

```typescript
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && !req.secure) {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});
```

### 7. Use Redis for Rate Limiting (Scalability)
For production with multiple servers, use Redis-based rate limiting:

```bash
npm install rate-limit-redis redis
```

```typescript
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';

const client = createClient({
  url: process.env.REDIS_URL
});

export const smsLimiter = rateLimit({
  store: new RedisStore({
    client,
    prefix: 'sms_limit:',
  }),
  windowMs: 60 * 60 * 1000,
  max: 5,
});
```

## Testing Rate Limits

### Test SMS Limiter
```bash
# Send 6 requests in quick succession (should fail on 6th)
for i in {1..6}; do
  curl -X POST http://localhost:3000/api/v1/auth/send-code \
    -H "Content-Type: application/json" \
    -d '{"phone": "+237600000000", "type": "LOGIN"}'
  echo "\n---Request $i---\n"
done
```

### Test Verification Limiter
```bash
# Try 6 wrong codes (should fail on 6th)
for i in {1..6}; do
  curl -X POST http://localhost:3000/api/v1/auth/verify-code \
    -H "Content-Type: application/json" \
    -d '{"phone": "+237600000000", "code": "9999", "type": "LOGIN"}'
  echo "\n---Attempt $i---\n"
done
```

## Security Audit Checklist

- [x] Rate limiting on SMS endpoints
- [x] Rate limiting on verification endpoints
- [x] Rate limiting on registration
- [x] Rate limiting on login/refresh
- [x] Database-level attempt tracking
- [x] JWT token expiration
- [x] Stateful token verification
- [x] Account active status check
- [x] Verification code expiration
- [x] One-time use verification codes
- [x] Phone number uniqueness constraint
- [ ] HTTPS enforcement (production)
- [ ] CORS restriction (production)
- [ ] Trust proxy configuration (production)
- [ ] Redis-based rate limiting (production scale)
- [ ] Monitoring and alerting
- [ ] Automated cleanup cron jobs

## Support

For security concerns or questions, contact the development team.

Last updated: 2026-01-03
