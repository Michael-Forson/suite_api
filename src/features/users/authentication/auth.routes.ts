import { Router } from "express";
import {
  registerUser,
  sendVerificationCode,
  verifyCode,
  sendEmailCode,
  verifyEmailCode,
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
router.post(
  "/send-code",
  smsLimiter,
  smsPerIdentifierLimiter,
  sendVerificationCode
);
router.post("/verify-code", verifyCodeLimiter, optionalAuthenticate, verifyCode);

router.post("/send-verification-email", authenticate, emailLimiter, sendEmailCode);
router.post("/verify-email", authenticate, verifyCodeLimiter, verifyEmailCode);

router.post("/refresh-token", loginLimiter, refreshToken);
router.post("/continue-with-google", loginLimiter, continueWithGoogle);
router.post("/continue-with-apple", loginLimiter, continueWithApple);
router.get("/me", authenticate, getMe);
router.patch("/profile", authenticate, updateProfile);
router.delete("/account", authenticate, deleteAccount);

export default router;
