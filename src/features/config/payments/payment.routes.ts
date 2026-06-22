import { Router } from "express";
import {
  initializePayment,
  handlePaystackWebhook,
  verifyPayment,
  checkPaymentStatus,
} from "./payment.controller.js";
import { authenticate } from "../../../middleware/users/auth.middleware.js";

const router = Router();

router.post("/initialize", authenticate, initializePayment);
router.get("/verify/:reference", authenticate, verifyPayment);
router.get("/check-status/:reference", authenticate, checkPaymentStatus);
router.post("/paystack/webhook", handlePaystackWebhook);

export default router;
