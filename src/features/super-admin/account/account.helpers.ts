import { Prisma } from "../../../generated/prisma/client.js";
import { SuperAdminStatus } from "../../../generated/prisma/enums.js";
import { prisma } from "../../../prisma.js";
import { isWriteConflictError } from "../../../utils/prisma.utils.js";
import { SUPER_ADMIN_SELECT } from "../authentication/super_admin_auth.helpers.js";

export const parseSuperAdminId = (value: unknown) => {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  return BigInt(value);
};

export const normalizeText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

export const isSuperAdminStatus = (
  value: unknown,
): value is SuperAdminStatus =>
  typeof value === "string" &&
  Object.values(SuperAdminStatus).includes(value as SuperAdminStatus);

export const isValidSuperAdminPassword = (password: string) =>
  password.length >= 12;

export const updateStatusSafely = async (
  superAdminId: bigint,
  status: SuperAdminStatus,
) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          if (status === SuperAdminStatus.DISABLED) {
            const activeCount = await tx.superAdmin.count({
              where: {
                id: { not: superAdminId },
                status: SuperAdminStatus.ACTIVE,
              },
            });
            if (activeCount === 0) return null;
          }

          return tx.superAdmin.update({
            where: { id: superAdminId },
            data: { status },
            select: SUPER_ADMIN_SELECT,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isWriteConflictError(error) && attempt < 2) continue;
      throw error;
    }
  }

  throw new Error("Unable to update super-admin status.");
};
