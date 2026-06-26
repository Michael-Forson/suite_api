import jwt from "jsonwebtoken";
import {
  AccountStatus,
  MemberStatus,
  OrganizationRole,
} from "../generated/prisma/enums.js";

export type TokenType = "user" | "super-admin";

export interface UserOrgAccessClaim {
  organizationId: string;
  organizationMemberId: string | null;
  ownerId: string;
  organizationRole: OrganizationRole;
  memberStatus: MemberStatus;
  organizationStatus: AccountStatus;
}

export interface UserAccessTokenClaims {
  orgs?: UserOrgAccessClaim[];
}

export const generateAccessToken = (
  id: bigint | string | number,
  type: TokenType,
  claims: UserAccessTokenClaims = {},
) => {
  let secret: string | undefined;
  let expiresIn: "10m" | "15m";

  if (type === "super-admin") {
    secret = process.env.SUPER_ADMIN_JWT_SECRET;
    expiresIn = "15m";
  } else if (type === "user") {
    secret = process.env.JWT_SECRET;
    expiresIn = "10m";
  } else {
    throw new Error("Invalid token type");
  }

  if (!secret) throw new Error("JWT access secret is not set");

  return jwt.sign({ id: id.toString(), type, ...claims }, secret, {
    expiresIn,
  });
};

export const generateRefreshToken = (
  id: bigint | string | number,
  type: TokenType,
) => {
  let secret: string | undefined;
  let expiresIn: "7d" | "60d";

  if (type === "super-admin") {
    secret = process.env.SUPER_ADMIN_JWT_REFRESH_SECRET;
    expiresIn = "7d";
  } else if (type === "user") {
    secret = process.env.JWT_REFRESH_SECRET;
    expiresIn = "60d";
  } else {
    throw new Error("Invalid token type");
  }

  if (!secret) throw new Error("JWT refresh secret is not set");

  return jwt.sign({ id: id.toString(), type }, secret, {
    expiresIn,
  });
};

export const verifyAccessToken = (token: string, type: TokenType) => {
  let secret: string | undefined;

  if (type === "super-admin") {
    secret = process.env.SUPER_ADMIN_JWT_SECRET;
  } else if (type === "user") {
    secret = process.env.JWT_SECRET;
  } else {
    throw new Error("Invalid token type");
  }

  if (!secret) throw new Error("JWT access secret is not set");

  return jwt.verify(token, secret);
};

export const verifyRefreshToken = (token: string, type: TokenType) => {
  let secret: string | undefined;

  if (type === "super-admin") {
    secret = process.env.SUPER_ADMIN_JWT_REFRESH_SECRET;
  } else if (type === "user") {
    secret = process.env.JWT_REFRESH_SECRET;
  } else {
    throw new Error("Invalid token type");
  }

  if (!secret) throw new Error("JWT refresh secret is not set");

  return jwt.verify(token, secret);
};
