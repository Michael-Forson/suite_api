import {
  generateAccessToken,
  generateRefreshToken,
} from "../../../utils/tokens.js";

export const SUPER_ADMIN_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const serializeSuperAdmin = <T extends { id: bigint }>(
  superAdmin: T,
) => ({
  ...superAdmin,
  id: superAdmin.id.toString(),
});

export const issueSuperAdminTokens = (superAdmin: { id: bigint }) => ({
  accessToken: generateAccessToken(superAdmin.id, "super-admin"),
  refreshToken: generateRefreshToken(superAdmin.id, "super-admin"),
});
