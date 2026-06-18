import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { Request } from "express";

/**
 * General API rate limiter
 * Prevents abuse of any endpoint
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

/**
 * Strict rate limiter for SMS sending endpoints
 * Prevents SMS bombing attacks
 */
export const smsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 7, // Limit each IP to 5 SMS requests per hour
  message: {
    success: false,
    message:
      "Too many SMS verification requests. Please try again after an hour.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count all requests, even successful ones
});

/**
 * Rate limiter for phone/email specific SMS requests
 * Prevents spamming a specific phone number or email
 */
export const smsPerIdentifierLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 3, // Limit to 3 SMS per phone/email per hour
  keyGenerator: (req: Request) => {
    // Use phone or email as the key instead of IP
    const { phone, email } = req.body;
    return phone || email || ipKeyGenerator(req.ip ?? "unknown");
  },
  message: {
    success: false,
    message:
      "Too many verification codes sent to this contact. Please try again after an hour.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for verification code attempts
 * Prevents brute force attacks on verification codes
 */
export const verifyCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 verification attempts per 15 minutes
  message: {
    success: false,
    message:
      "Too many verification attempts. Please try again after 15 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful verifications
});

/**
 * Rate limiter for login attempts
 * Prevents credential stuffing attacks
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 login attempts per 15 minutes
  message: {
    success: false,
    message: "Too many login attempts. Please try again after 15 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

/**
 * Rate limiter for registration
 * Prevents mass account creation
 */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 registrations per hour
  message: {
    success: false,
    message:
      "Too many accounts created from this IP. Please try again after an hour.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for email verification requests
 */
export const emailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 email requests per hour
  message: {
    success: false,
    message:
      "Too many email verification requests. Please try again after an hour.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});
