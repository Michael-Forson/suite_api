import jwt from "jsonwebtoken";

export type TokenType = "user" | "super-admin";

export const generateAccessToken = (
  id: bigint | string | number,
  type: TokenType,
) => {
  let secret: string | undefined;

  if (type === "super-admin") {
    secret = process.env.SUPER_ADMIN_JWT_SECRET;
  } else if (type === "user") {
    secret = process.env.JWT_SECRET;
  } else {
    throw new Error("Invalid token type");
  }

  if (!secret) throw new Error("JWT access secret is not set");

  return jwt.sign({ id: id.toString(), type }, secret, {
    expiresIn: "15m",
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
