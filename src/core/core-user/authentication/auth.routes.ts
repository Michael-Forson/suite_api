import { Router } from "express";
import {
  registerUser,
  loginUser,
  sendLoginCode,
  verifyLoginCode,
  registerWithEmailCode,
  requestPasswordReset,
  resetPassword,
  sendPhoneVerificationCode,
  verifyPhoneCode,
  refreshToken,
  getMe,
  updateProfile,
  continueWithGoogle,
  continueWithApple,
  deleteAccount,
} from "./auth.controller.js";
import { authenticate, optionalAuthenticate } from "../../../middleware/users/auth.middleware.js";
import {
  registerLimiter,
  smsLimiter,
  smsPerIdentifierLimiter,
  verifyCodeLimiter,
  loginLimiter,
  emailLimiter,
} from "../../../middleware/common/rateLimiter.middleware.js";

const router = Router();

// Apply multiple rate limiters: IP-based + identifier-based for SMS
router.post("/register", registerLimiter, registerUser);
router.post("/login", loginLimiter, loginUser);
router.post("/send-login-code", emailLimiter, sendLoginCode);
router.post("/verify-login-code", verifyCodeLimiter, verifyLoginCode);
router.post("/register-with-email-code", verifyCodeLimiter, registerWithEmailCode);
router.post(
  "/password-reset/request",
  smsLimiter,
  smsPerIdentifierLimiter,
  requestPasswordReset,
);
router.post("/password-reset/confirm", verifyCodeLimiter, resetPassword);
router.post(
  "/send-phone-code",
  smsLimiter,
  smsPerIdentifierLimiter,
  sendPhoneVerificationCode,
);
router.post(
  "/verify-phone-code",
  verifyCodeLimiter,
  optionalAuthenticate,
  verifyPhoneCode,
);

router.post("/refresh-token", loginLimiter, refreshToken);
router.post("/continue-with-google", loginLimiter, continueWithGoogle);
router.post("/continue-with-apple", loginLimiter, continueWithApple);
router.get("/me", authenticate, getMe);
router.patch("/profile", authenticate, updateProfile);
router.delete("/delete-account", authenticate, deleteAccount);

export default router;
