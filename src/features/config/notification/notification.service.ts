import { Expo } from "expo-server-sdk";
import { prisma } from "../../../prisma.js";

interface RegisterDeviceTokenParams {
  userId: string;
  pushToken: string;
  platform: string;
}
interface SendNotificationParams {
  userId: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}

const expo = new Expo();

interface DeleteDeadTokensParams {
  userId: string;
  receiptIdToToken: Map<string, string>;
}

const deleteDeadTokens = async ({
  userId,
  receiptIdToToken,
}: DeleteDeadTokensParams) => {
  const receiptIds = Array.from(receiptIdToToken.keys()).filter(
    (id) => !id.startsWith("immediate:"),
  );
  const removedTokens: string[] = [];

  const receiptChunks = expo.chunkPushNotificationReceiptIds(receiptIds);
  for (const chunk of receiptChunks) {
    const receipts = await expo.getPushNotificationReceiptsAsync(chunk);

    for (const [receiptId, receipt] of Object.entries(receipts)) {
      if (
        receipt.status === "error" &&
        receipt.details?.error === "DeviceNotRegistered"
      ) {
        const token = receiptIdToToken.get(receiptId);
        if (token) removedTokens.push(token);
      }
    }
  }

  for (const [key, token] of receiptIdToToken.entries()) {
    if (key.startsWith("immediate:")) {
      removedTokens.push(token);
    }
  }

  const uniqueRemoved = Array.from(new Set(removedTokens));
  if (uniqueRemoved.length > 0) {
    await prisma.deviceToken.deleteMany({
      where: {
        userId: BigInt(userId),
        pushToken: { in: uniqueRemoved },
      },
    });
  }

  return uniqueRemoved;
};

export const registerDeviceToken = async ({
  userId,
  pushToken,
  platform,
}: RegisterDeviceTokenParams) => {
  const existing = await prisma.deviceToken.findFirst({
    where: {
      userId: BigInt(userId),
      pushToken,
      platform,
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.deviceToken.create({
    data: {
      userId: BigInt(userId),
      pushToken,
      platform,
    },
  });
};

export const sendNotification = async ({
  userId,
  title,
  body,
  metadata,
}: SendNotificationParams) => {
  const tokenRows = await prisma.deviceToken.findMany({
    where: {
      userId: BigInt(userId),
    },
    select: {
      pushToken: true,
    },
  });

  const tokens = Array.from(new Set(tokenRows.map((row) => row.pushToken)));
  const invalidTokens: string[] = [];
  const messages = [];

  for (const token of tokens) {
    if (!Expo.isExpoPushToken(token)) {
      invalidTokens.push(token);
      continue;
    }

    messages.push({
      to: token,
      sound: "default",
      title,
      body,
      data: metadata || {},
    });
  }

  if (messages.length === 0) {
    return { tickets: [], invalidTokens, removedTokens: [] };
  }

  const tickets = [];
  const receiptIdToToken = new Map<string, string>();

  // Send notifications individually to avoid "PUSH_TOO_MANY_EXPERIENCE_IDS" error.
  // This occurs when a request contains tokens from multiple Expo experience IDs,
  // which can happen during development if the project owner or slug changes.
  for (const message of messages) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync([message]);
      tickets.push(...ticketChunk);

      for (let i = 0; i < ticketChunk.length; i += 1) {
        const ticket = ticketChunk[i];
        const token = typeof message.to === "string" ? message.to : undefined;

        if (
          ticket.status === "error" &&
          ticket.details?.error === "DeviceNotRegistered" &&
          token
        ) {
          receiptIdToToken.set(`immediate:${token}`, token);
        } else if ("id" in ticket && ticket.id && token) {
          receiptIdToToken.set(ticket.id, token);
        }
      }
    } catch (error) {
      console.error(
        `Failed to send push notification to token ${message.to}:`,
        error,
      );

      // If the error is PUSH_TOO_MANY_EXPERIENCE_IDS, even though we send individually,
      // it might still happen if the single token has some weird state, or we can just log it.
    }
  }

  const removedTokens = await deleteDeadTokens({
    userId,
    receiptIdToToken,
  });

  return { tickets, invalidTokens, removedTokens };
};

export const removeDeviceToken = async (userId: string, pushToken: string) => {
  return prisma.deviceToken.deleteMany({
    where: {
      userId: BigInt(userId),
      pushToken,
    },
  });
};

export const markNotificationAsRead = async (id: string, userId: string) => {
  return prisma.notification.updateMany({
    where: {
      id: BigInt(id),
      userId: BigInt(userId),
    },
    data: {
      readAt: new Date(),
    },
  });
};

export const markAllNotificationsAsRead = async (userId: string) => {
  return prisma.notification.updateMany({
    where: {
      userId: BigInt(userId),
      readAt: null,
    },
    data: {
      readAt: new Date(),
    },
  });
};

export const createUserNotification = async (params: {
  userId: string | null;
  title: string;
  message: string;
  type?: string;
  metadata?: Record<string, unknown>;
}) => {
  const targetAudience = params.userId ? "USER" : "ALL";

  // 1. Save to database
  const notification = await prisma.notification.create({
    data: {
      userId: params.userId ? BigInt(params.userId) : null,
      targetAudience,
      title: params.title,
      message: params.message,
      type: params.type || "general",
      metadata: (params.metadata as any) || {},
    },
  });

  // 2. Send push notification if a userId is provided
  if (params.userId) {
    try {
      await sendNotification({
        userId: params.userId,
        title: params.title,
        body: params.message,
        metadata: params.metadata,
      });
    } catch (error) {
      console.error("Failed to send push notification:", error);
      // We don't throw here to ensure the DB record creation isn't rolled back
      // if only the push notification fails.
    }
  }

  return {
    ...notification,
    id: notification.id.toString(),
    userId: notification.userId?.toString() || null,
  };
};
