import { Router } from "express";
import { authenticate } from "../../../middleware/users/auth.middleware.js";
import {
  getUserNotifications,
  registerToken,
  unregisterToken,
  sendTestNotification,
  markAsRead,
  markAllAsRead,
} from "./notification.controller.js";

const router = Router();

router.post("/push-token", authenticate, registerToken);
router.delete("/push-token", authenticate, unregisterToken);
router.post("/send-test", sendTestNotification);
router.get("/", authenticate, getUserNotifications);
router.patch("/read-all", authenticate, markAllAsRead);
router.patch("/:id/read", authenticate, markAsRead);

export default router;
