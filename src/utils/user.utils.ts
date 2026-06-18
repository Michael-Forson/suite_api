import { prisma } from "../prisma.js";

/**
 * Checks if an email or phone number is already in use by another user.
 *
 * @param params Object containing email, phone and optional excludeUserId
 * @returns Object with available status and conflict message if any
 */
export const checkUserAvailability = async (params: {
  email?: string;
  phone?: string;
  excludeUserId?: bigint;
}) => {
  const { email, phone, excludeUserId } = params;

  if (email) {
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser && (!excludeUserId || existingUser.id !== excludeUserId)) {
      return {
        available: false,
        conflict: "email",
        message:
          "An account with this email already exists. Please try logging in instead.",
      };
    }
  }

  if (phone) {
    const existingUser = await prisma.user.findUnique({
      where: { phone },
    });

    if (existingUser && (!excludeUserId || existingUser.id !== excludeUserId)) {
      return {
        available: false,
        conflict: "phone",
        message:
          "An account with this phone number already exists. Please try logging in instead.",
      };
    }
  }

  return { available: true };
};
