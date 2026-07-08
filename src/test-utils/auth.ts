import { generateAccessToken } from "../utils/tokens.js";

export function authHeader(userId: string) {
  return `Bearer ${generateAccessToken(userId, "user")}`;
}

export function superAdminAuthHeader(superAdminId: string) {
  return `Bearer ${generateAccessToken(superAdminId, "super-admin")}`;
}
