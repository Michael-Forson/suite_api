import { generateAccessToken } from "../utils/tokens.js";

export function authHeader(userId: bigint | string) {
  return `Bearer ${generateAccessToken(userId, "user")}`;
}

export function superAdminAuthHeader(superAdminId: bigint | string) {
  return `Bearer ${generateAccessToken(superAdminId, "super-admin")}`;
}
