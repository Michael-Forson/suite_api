import { prisma } from "../prisma.js";

/**
 * Track verification attempts per identifier and IP
 * This provides an additional layer of security beyond rate limiting
 */
export const trackVerificationAttempt = async (
  identifier: string,
  ipAddress: string
): Promise<{ allowed: boolean; attempts: number; maxAttempts: number }> => {
  const maxAttempts = 10; // Maximum attempts per hour per identifier+IP combination
  const windowMinutes = 60; // Time window in minutes

  // Find or create the attempt record
  const existingAttempt = await prisma.verificationAttempt.findUnique({
    where: {
      identifier_ipAddress: {
        identifier,
        ipAddress,
      },
    },
  });

  if (!existingAttempt) {
    // First attempt - create record
    await prisma.verificationAttempt.create({
      data: {
        identifier,
        ipAddress,
        attempts: 1,
        lastAttempt: new Date(),
      },
    });

    return { allowed: true, attempts: 1, maxAttempts };
  }

  // Check if the window has expired
  const windowExpiry = new Date(
    existingAttempt.lastAttempt.getTime() + windowMinutes * 60 * 1000
  );
  const now = new Date();

  if (now > windowExpiry) {
    // Window expired - reset counter
    await prisma.verificationAttempt.update({
      where: {
        identifier_ipAddress: {
          identifier,
          ipAddress,
        },
      },
      data: {
        attempts: 1,
        lastAttempt: now,
      },
    });

    return { allowed: true, attempts: 1, maxAttempts };
  }

  // Within the window - check if limit exceeded
  if (existingAttempt.attempts >= maxAttempts) {
    return {
      allowed: false,
      attempts: existingAttempt.attempts,
      maxAttempts,
    };
  }

  // Increment attempt counter
  const updated = await prisma.verificationAttempt.update({
    where: {
      identifier_ipAddress: {
        identifier,
        ipAddress,
      },
    },
    data: {
      attempts: {
        increment: 1,
      },
      lastAttempt: now,
    },
  });

  return {
    allowed: true,
    attempts: updated.attempts,
    maxAttempts,
  };
};

/**
 * Reset verification attempts for an identifier after successful verification
 */
export const resetVerificationAttempts = async (
  identifier: string,
  ipAddress: string
): Promise<void> => {
  await prisma.verificationAttempt.deleteMany({
    where: {
      identifier,
      ipAddress,
    },
  });
};

/**
 * Clean up old verification attempts (run periodically via cron job)
 */
export const cleanupOldAttempts = async (): Promise<number> => {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const result = await prisma.verificationAttempt.deleteMany({
    where: {
      lastAttempt: {
        lt: oneDayAgo,
      },
    },
  });

  return result.count;
};
