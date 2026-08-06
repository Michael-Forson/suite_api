import { isRootSuperAdminEmail } from "../../../utils/rootSuperAdmin.js";
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

/**
 * `isRoot` is derived, never stored — it is whether this account holds the
 * address in `SUPER_ADMIN_EMAIL`. The console reads it to decide which actions
 * to offer; the API re-derives it on every request and never trusts the client.
 */
export const serializeSuperAdmin = <T extends { id: string; email: string }>(
  superAdmin: T,
) => ({
  ...superAdmin,
  id: superAdmin.id.toString(),
  isRoot: isRootSuperAdminEmail(superAdmin.email),
});

export const issueSuperAdminTokens = (superAdmin: { id: string }) => ({
  accessToken: generateAccessToken(superAdmin.id, "super-admin"),
  refreshToken: generateRefreshToken(superAdmin.id, "super-admin"),
});
