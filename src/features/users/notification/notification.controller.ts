import { Response } from "express";
import asyncHandler from "express-async-handler";
import { AuthRequest } from "../../../middleware/users/auth.middleware.js";
import { prisma } from "../../../prisma.js";
import {
  RegisterDeviceTokenRequestBody,
  SendNotificationRequestBody,
} from "./notification.types.js";
import {
  registerDeviceToken,
  removeDeviceToken,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  createUserNotification,
} from "./notification.service.js";

export const registerToken = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const userId = req.userId;
    const { pushToken, platform }: RegisterDeviceTokenRequestBody = req.body;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
      return;
    }

    if (!pushToken || !platform) {
      res.status(400).json({
        success: false,
        message: "pushToken and platform are required",
      });
      return;
    }

    const saved = await registerDeviceToken({
      userId,
      pushToken,
      platform,
    });

    res.status(200).json({
      success: true,
      message: "Device token registered",
      data: {
        id: saved.id.toString(),
        userId: saved.userId?.toString() ?? null,
        pushToken: saved.pushToken,
        platform: saved.platform,
      },
    });
  },
);

export const unregisterToken = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const userId = req.userId;
    const { pushToken } = req.body as { pushToken?: string };

    if (!userId) {
      res.status(401).json({ success: false, message: "Authentication required." });
      return;
    }

    if (!pushToken) {
      res.status(400).json({ success: false, message: "pushToken is required." });
      return;
    }

    await removeDeviceToken(userId, pushToken);

    res.status(200).json({
      success: true,
      message: "Device token removed.",
    });
  },
);

export const  sendTestNotification = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    // const userId = "1";
    const userId = req.userId;
    const { title, body, metadata }: SendNotificationRequestBody = req.body;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
      return;
    }

    if (!title || !body) {
      res.status(400).json({
        success: false,
        message: "title and body are required",
      });
      return;
    }

    const result = await createUserNotification({
      userId,
      title,
      message: body,
      metadata,
    });

    res.status(200).json({
      success: true,
      message: "Notification sent",
      data: result,
    });
  },
);

export const getUserNotifications = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const userId = req.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
      return;
    }

    const threeWeeksAgo = new Date();
    threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);

    const notifications = await prisma.notification.findMany({
      where: {
        createdAt: { gte: threeWeeksAgo },
        OR: [
          { userId: BigInt(userId) },
          {
            userId: null,
            targetAudience: { in: ["USER", "ALL"] },
          },
        ],
      },
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json({
      success: true,
      data: notifications.map(({ id, userId, ...rest }) => ({
        ...rest,
        id: id.toString(),
        userId: userId?.toString() || null,
      })),
    });
  },
);

export const markAsRead = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const userId = req.userId;
    const { id } = req.params;

    if (!userId) {
      res
        .status(401)
        .json({ success: false, message: "Authentication required." });
      return;
    }

    await markNotificationAsRead(id as string, userId);

    res.status(200).json({
      success: true,
      message: "Notification marked as read",
    });
  },
);

export const markAllAsRead = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const userId = req.userId;

    if (!userId) {
      res
        .status(401)
        .json({ success: false, message: "Authentication required." });
      return;
    }

    await markAllNotificationsAsRead(userId);

    res.status(200).json({
      success: true,
      message: "All notifications marked as read",
    });
  },
);
