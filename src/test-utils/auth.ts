import { generateAccessToken } from "../utils/tokens.js";

export function authHeader(userId: bigint | string) {
  return `Bearer ${generateAccessToken(userId, "user")}`;
}
