import jwt from "jsonwebtoken";

export type TokenType = "user";

export const generateAccessToken = (id: any, type: TokenType) => {
  return jwt.sign({ id: id.toString(), type }, process.env.JWT_SECRET!, {
    expiresIn: "15m",
  });
};

export const generateRefreshToken = (id: any, type: TokenType) => {
  return jwt.sign(
    { id: id.toString(), type },
    process.env.JWT_REFRESH_SECRET!,
    {
      expiresIn: "60d",
    },
  );
};

export const verifyAccessToken = (token: string) => {
  return jwt.verify(token, process.env.JWT_SECRET!);
};

export const verifyRefreshToken = (token: string) => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET!);
};
