import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import { prisma } from "../../../prisma.js";
import {
  AuthProvider,
  CodeType,
  Gender,
} from "../../../generated/prisma/enums.js";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../../../utils/tokens.js";
import {
  AppleAuthRequestBody,
  GoogleAuthRequestBody,
  RefreshTokenRequestBody,
  RegisterRequestBody,
  SendCodeRequestBody,
  UpdateProfileRequestBody,
  VerifyCodeRequestBody,
} from "./auth.types.js";
import {
  isValidCode,
  isValidEmail,
  isValidPhone,
  isValidPassword,
  parseDob,
} from "../../../utils/validators.js";
import {
  consumeVerificationCode,
  createVerificationCode,
} from "../../../utils/verificationCodes.js";
import { dispatchOtp, type OtpChannel } from "../../../utils/otp.js";
import {
  sendEmailVerificationCode,
  validateVerificationCode,
} from "../../../utils/verification.service.js";
import { sendTemplateEmail } from "../../../utils/emails/email.service.js";
import { AuthRequest } from "../../../middleware/users/auth.middleware.js";
import { checkUserAvailability } from "../../../utils/user.utils.js";
import {
  trackVerificationAttempt,
  resetVerificationAttempts,
} from "../../../utils/verificationAttempts.js";
import { hashPassword } from "../../../utils/password.js";

export const registerUser = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      firstName,
      lastName,
      email,
      phone,
      password,
      gender,
      dob,
    }: RegisterRequestBody = req.body;

    if (!email ||!phone || !password) {
      res.status(400).json({
        success: false,
        message:
          "Missing required email,phone or password are required",
      });
      return;
    }

    const identifiers = [email, phone].filter(Boolean);
    if (identifiers.length !== 1) {
      res.status(400).json({
        success: false,
        message: "Provide exactly one of email or phone",
      });
      return;
    }

    if (!isValidPassword(password)) {
      res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters",
      });
      return;
    }

    if (email && !isValidEmail(email)) {
      res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
      return;
    }

    if (phone && !isValidPhone(phone)) {
      res.status(400).json({
        success: false,
        message: "Invalid phone format",
      });
      return;
    }

    try {
      const availability = await checkUserAvailability({ email, phone });
      if (!availability.available) {
        res.status(409).json({
          success: false,
          message: availability.message,
        });
        return;
      }
    } catch (error: any) {
      console.error("Database query error:", {
        message: error.message,
        code: error.code,
        stack: error.stack,
      });
      if (error.message?.includes("timeout") || error.code === "P1008") {
        res.status(503).json({
          success: false,
          message: "Database connection timeout. Please try again later.",
        });
        return;
      }
      res.status(500).json({
        success: false,
        message:
          "An error occurred while processing your request. Please try again.",
      });
      return;
    }

    const dobDate = parseDob(dob);
    if (dob && !dobDate) {
      res.status(400).json({
        success: false,
        message: "Invalid date of birth format",
      });
      return;
    }

    try {
      const hashedPassword = await hashPassword(password);

      const user = await prisma.user.create({
        data: {
          firstName: firstName ?? null,
          lastName:lastName ?? null,
          email: email ?? null,
          phone: phone ?? null,
          password: hashedPassword,
          gender: gender || null,
          dob: dobDate || null,
          authProvider: email ? AuthProvider.EMAIL : AuthProvider.PHONE,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          gender: true,
          dob: true,
          authProvider: true,
          isActive: true,
          emailVerifiedAt: true,
          phoneVerifiedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const userResponse = {
        ...user,
        id: user.id.toString(),
      };

      res.status(201).json({
        success: true,
        message: "User registered successfully",
        data: userResponse,
      });
    } catch (error: any) {
      console.error("Database error creating user:", {
        message: error.message,
        code: error.code,
        stack: error.stack,
      });
      res.status(500).json({
        success: false,
        message: "An internal server error occurred. Please try again.",
      });
      return;
    }
  },
);

export const sendVerificationCode = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      phone,
      email,
      type,
      channel = "both",
    }: SendCodeRequestBody = req.body;

    const codeType = type || "ACTIVATION";
    const prismaCodeType = CodeType[codeType as keyof typeof CodeType];

    if (!prismaCodeType) {
      res.status(400).json({
        success: false,
        message: "Invalid code type",
      });
      return;
    }

    const identifiers = [phone, email].filter(Boolean);
    if (identifiers.length !== 1) {
      res.status(400).json({
        success: false,
        message: "Provide exactly one of phone or email",
      });
      return;
    }

    const identifier = phone || email!;

    if (codeType === "LOGIN" || codeType === "RESET") {
      try {
        const user = await prisma.user.findUnique({
          where: phone ? { phone } : { email },
        });

        if (!user) {
          res.status(404).json({
            success: false,
            message:
              "We couldn't find an account with this " +
              (phone ? "phone number" : "email") +
              ". Would you like to create one?",
          });
          return;
        }
      } catch (error: any) {
        console.error("Database check error:", error);
        res.status(500).json({
          success: false,
          message: "An error occurred while checking your account.",
        });
        return;
      }
    }

    if (phone && !isValidPhone(phone)) {
      res.status(400).json({
        success: false,
        message: "Invalid phone format",
      });
      return;
    }

    if (email && !isValidEmail(email)) {
      res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
      return;
    }

    let codeRecord;

    try {
      codeRecord = await createVerificationCode(identifier, prismaCodeType);
    } catch (error: any) {
      console.error("Database error creating verification code:", {
        message: error.message,
        code: error.code,
        stack: error.stack,
      });
      res.status(500).json({
        success: false,
        message: "An internal server error occurred. Please try again.",
      });
      return;
    }

    try {
      if (phone) {
        await dispatchOtp(phone, codeRecord.code, channel as OtpChannel);
      } else if (email) {
        const templateName =
          prismaCodeType === CodeType.RESET
            ? "App_Password_Reset"
            : "App_Email_Verification";

        await sendTemplateEmail(email, templateName, {
          userName: "",
          verificationCode: codeRecord.code,
          appName: "Suite",
        });
      }
    } catch (error: any) {
      console.error("Verification code delivery error:", {
        message: error.message,
        stack: error.stack,
      });
      res.status(500).json({
        success: false,
        message: "Failed to send verification code. Please try again.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Verification code sent",
    });
  },
);

export const verifyCode = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { phone, email, code, type }: VerifyCodeRequestBody = req.body;

    const codeType = type || "ACTIVATION";
    const prismaCodeType = CodeType[codeType as keyof typeof CodeType];

    if (!prismaCodeType) {
      res.status(400).json({
        success: false,
        message: "Invalid code type",
      });
      return;
    }

    const identifiers = [phone, email].filter(Boolean);
    if (identifiers.length !== 1) {
      res.status(400).json({
        success: false,
        message: "Provide exactly one of phone or email",
      });
      return;
    }

    const identifier = phone || email!;

    if (phone && !isValidPhone(phone)) {
      res.status(400).json({
        success: false,
        message: "Invalid phone format",
      });
      return;
    }

    if (email && !isValidEmail(email)) {
      res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
      return;
    }

    if (!isValidCode(code, 6)) {
      res.status(400).json({
        success: false,
        message: "Invalid verification code format. Code must be 6 digits.",
      });
      return;
    }

    const ipAddress = (req.ip || req.socket.remoteAddress || "unknown").replace(
      "::ffff:",
      "",
    );
    const attemptCheck = await trackVerificationAttempt(identifier, ipAddress);

    if (!attemptCheck.allowed) {
      res.status(429).json({
        success: false,
        message: `Too many verification attempts. Please try again later.`,
      });
      return;
    }

    let user;
    try {
      user = await prisma.user.findUnique({
        where: phone ? { phone: identifier } : { email: identifier },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          gender: true,
          dob: true,
          emailVerifiedAt: true,
          phoneVerifiedAt: true,
          isActive: true,
          authProvider: true,
        },
      });
    } catch (error: any) {
      console.error("Database error fetching user:", {
        message: error.message,
        code: error.code,
        stack: error.stack,
      });
      res.status(500).json({
        success: false,
        message: "An internal server error occurred. Please try again.",
      });
      return;
    }

    if (!user) {
      res.status(404).json({
        success: false,
        message: `User not found with this ${phone ? "phone number" : "email"}`,
      });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({
        success: false,
        message: "This account has been deactivated.",
      });
      return;
    }
      let verificationCheck;
      try {
        verificationCheck = await consumeVerificationCode(
          identifier,
          code,
          prismaCodeType,
        );
      } catch (error: any) {
        console.error("Database error consuming verification code:", {
          message: error.message,
          code: error.code,
          stack: error.stack,
        });
        res.status(500).json({
          success: false,
          message: "An internal server error occurred. Please try again.",
        });
        return;
      }

      if (!verificationCheck.valid) {
        const message =
          verificationCheck.reason === "expired"
            ? "Verification code has expired. Please request a new one."
            : "Invalid or incorrect verification code";
        res.status(400).json({ success: false, message });
        return;
      }
    
    const authenticatedUserId = req.userId ? BigInt(req.userId) : null;
    const isSocialMerge =
      authenticatedUserId &&
      authenticatedUserId !== user.id &&
      codeType === "ACTIVATION";

    try {
      if (isSocialMerge) {
        const socialUser = await prisma.user.findUnique({
          where: { id: authenticatedUserId },
          select: {
            authProvider: true,
            phone: true,
            googleId: true,
            appleId: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        });

        const isGoogle =
          socialUser?.authProvider === AuthProvider.GOOGLE &&
          !!socialUser.googleId;
        const isApple =
          socialUser?.authProvider === AuthProvider.APPLE &&
          !!socialUser.appleId;

        if (!socialUser || socialUser.phone || (!isGoogle && !isApple)) {
          res.status(400).json({
            success: false,
            message:
              "Account linking is only available for social accounts without a phone number.",
          });
          return;
        }

        const mergedUser = await prisma.$transaction(async (tx) => {
          const freshPhoneUser = await tx.user.findUnique({
            where: { id: user.id },
            select: { email: true },
          });

          if (
            freshPhoneUser?.email &&
            freshPhoneUser.email !== socialUser.email
          ) {
            throw new Error("LINKING_BLOCKED");
          }

          await tx.user.update({
            where: { id: authenticatedUserId },
            data: {
              googleId: null,
              appleId: null,
              email: null,
              isActive: false,
            },
          });

          const merged = await tx.user.update({
            where: { id: user.id },
            data: {
              ...(isGoogle ? { googleId: socialUser.googleId } : {}),
              ...(isApple ? { appleId: socialUser.appleId } : {}),
              authProvider: socialUser.authProvider,
              ...(!user.email && socialUser.email
                ? { email: socialUser.email, emailVerifiedAt: new Date() }
                : {}),
              phoneVerifiedAt: new Date(),
              firstName: user.firstName || socialUser.firstName || undefined,
              lastName: user.lastName || socialUser.lastName || undefined,
            },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              gender: true,
              dob: true,
              emailVerifiedAt: true,
              phoneVerifiedAt: true,
              isActive: true,
              authProvider: true,
            },
          });

          await tx.notification.updateMany({
            where: { userId: authenticatedUserId },
            data: { userId: user.id },
          });

          await tx.transaction.updateMany({
            where: { userId: authenticatedUserId },
            data: { userId: user.id },
          });

          return merged;
        });

        await resetVerificationAttempts(identifier, ipAddress);

        const accessToken = generateAccessToken(mergedUser.id, "user");
        const refreshToken = generateRefreshToken(mergedUser.id, "user");

        res.status(201).json({
          success: true,
          message: "Phone verified and account linked successfully",
          data: {
            user: { ...mergedUser, id: mergedUser.id.toString() },
            tokens: { accessToken, refreshToken },
          },
        });
        return;
      }

      await prisma.user.update({
        where: { id: user.id },
        data: phone
          ? { phoneVerifiedAt: new Date() }
          : { emailVerifiedAt: new Date() },
      });
    } catch (error: any) {
      if (error.message === "LINKING_BLOCKED") {
        res.status(409).json({
          success: false,
          message:
            "This phone number is already associated with another account.",
        });
        return;
      }
      console.error("Database error updating user:", {
        message: error.message,
        code: error.code,
        stack: error.stack,
      });
      res.status(500).json({
        success: false,
        message: "An internal server error occurred. Please try again.",
      });
      return;
    }

    await resetVerificationAttempts(identifier, ipAddress);

    const accessToken = generateAccessToken(user.id, "user");
    const refreshToken = generateRefreshToken(user.id, "user");

    const userResponse = {
      ...user,
      id: user.id.toString(),
      ...(phone
        ? { phoneVerifiedAt: new Date() }
        : { emailVerifiedAt: new Date() }),
    };

    res.status(201).json({
      success: true,
      message: `${phone ? "Phone number" : "Email"} verified successfully`,
      data: {
        user: userResponse,
        tokens: {
          accessToken,
          refreshToken,
        },
      },
    });
  },
);

export const refreshToken = asyncHandler(
  async (req: Request, res: Response) => {
    const { refreshToken }: RefreshTokenRequestBody = req.body;

    if (!refreshToken) {
      res.status(400).json({
        success: false,
        message: "Refresh token is required",
      });
      return;
    }

    try {
      const decoded = verifyRefreshToken(refreshToken) as {
        id: string;
        type?: string;
      };

      if (decoded.type !== "user") {
        res.status(401).json({
          success: false,
          message: "Invalid token. Please login again.",
        });
        return;
      }

      const userId = BigInt(decoded.id);

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        res.status(401).json({
          success: false,
          message: "User not found. Please login again.",
        });
        return;
      }

      if (!user.isActive) {
        res.status(401).json({
          success: false,
          message: "This account has been deactivated.",
        });
        return;
      }

      const newAccessToken = generateAccessToken(user.id, "user");
      const newRefreshToken = generateRefreshToken(user.id, "user");

      res.status(200).json({
        success: true,
        message: "Token refreshed successfully",
        data: {
          tokens: {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
          },
        },
      });
    } catch (error: any) {
      console.error("Token refresh error:", {
        message: error.message,
        name: error.name,
      });
      res.status(401).json({
        success: false,
        message: "Invalid or expired refresh token. Please login again.",
      });
      return;
    }
  },
);

export const getMe = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: BigInt(userId) },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      gender: true,
      dob: true,
      emailVerifiedAt: true,
      phoneVerifiedAt: true,
      isActive: true,
      authProvider: true,
    },
  });

  if (!user) {
    res.status(404).json({ success: false, message: "User not found" });
    return;
  }

  res.status(200).json({
    success: true,
    data: { user: { ...user, id: user.id.toString() } },
  });
});

export const updateProfile = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }
    const userBigId = BigInt(userId);

    const {
      firstName,
      lastName,
      phone,
      email,
      gender,
      dob,
    }: UpdateProfileRequestBody = req.body;

    if (phone && !isValidPhone(phone)) {
      res
        .status(400)
        .json({ success: false, message: "Invalid phone number format" });
      return;
    }

    if (email && !isValidEmail(email)) {
      res.status(400).json({ success: false, message: "Invalid email format" });
      return;
    }

    const validGenders = ["MALE", "FEMALE", "OTHER"];
    if (gender && !validGenders.includes(gender)) {
      res.status(400).json({
        success: false,
        message: "Gender must be Male, Female, or Other.",
      });
      return;
    }

    const dobDate = dob ? parseDob(dob) : undefined;
    if (dob && !dobDate) {
      res
        .status(400)
        .json({ success: false, message: "Invalid date of birth format" });
      return;
    }

    try {
      const availability = await checkUserAvailability({
        email,
        phone,
        excludeUserId: userBigId,
      });

      let skipPhone = false;
      if (
        !availability.available &&
        availability.conflict === "phone" &&
        phone
      ) {
        const currentUser = await prisma.user.findUnique({
          where: { id: userBigId },
          select: { authProvider: true, phone: true, email: true },
        });

        if (
          currentUser &&
          !currentUser.phone &&
          (currentUser.authProvider === AuthProvider.GOOGLE ||
            currentUser.authProvider === AuthProvider.APPLE)
        ) {
          const existingPhoneUser = await prisma.user.findUnique({
            where: { phone },
            select: { email: true },
          });

          if (
            existingPhoneUser?.email &&
            existingPhoneUser.email !== currentUser.email
          ) {
            res.status(409).json({
              success: false,
              message:
                "This phone number is already associated with another account.",
            });
            return;
          }

          skipPhone = true;
        } else {
          res.status(409).json({
            success: false,
            message: availability.message,
          });
          return;
        }
      } else if (!availability.available) {
        res.status(409).json({
          success: false,
          message: availability.message,
        });
        return;
      }

      const updatedUser = await prisma.user.update({
        where: { id: userBigId },
        data: {
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          phone: skipPhone ? undefined : phone || undefined,
          email: email || undefined,
          gender: (gender as Gender) || undefined,
          dob: dobDate || undefined,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          gender: true,
          dob: true,
          authProvider: true,
          isActive: true,
          emailVerifiedAt: true,
          phoneVerifiedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        data: {
          ...updatedUser,
          id: updatedUser.id.toString(),
        },
      });
    } catch (error: any) {
      console.error("Profile update error:", error);
      res.status(500).json({
        success: false,
        message: "An error occurred while updating your profile.",
      });
    }
  },
);

export const sendEmailCode = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { email } = req.body;

    try {
      await sendEmailVerificationCode(email, { codeLength: 6 });

      res.status(200).json({
        success: true,
        message: "Verification code sent to your email",
      });
    } catch (error: any) {
      console.error("Error in sendEmailCode:", error);
      res.status(500).json({
        success: false,
        message: "Failed to send verification code. Please try again.",
      });
    }
  },
);

export const continueWithGoogle = asyncHandler(
  async (req: Request, res: Response) => {
    const { email, googleId }: GoogleAuthRequestBody = req.body;

    if (!email || !googleId) {
      res.status(400).json({
        success: false,
        message: "Email and Google ID are required",
      });
      return;
    }

    if (!isValidEmail(email)) {
      res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
      return;
    }

    try {
      let user = await prisma.user.findFirst({
        where: {
          OR: [{ email }, { googleId }],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          gender: true,
          dob: true,
          emailVerifiedAt: true,
          phoneVerifiedAt: true,
          isActive: true,
          authProvider: true,
        },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            email,
            googleId,
            authProvider: AuthProvider.GOOGLE,
            emailVerifiedAt: new Date(),
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            gender: true,
            dob: true,
            emailVerifiedAt: true,
            phoneVerifiedAt: true,
            isActive: true,
            authProvider: true,
          },
        });
      } else if (!user.isActive) {
        res.status(403).json({
          success: false,
          message: "This account has been deactivated.",
        });
        return;
      } else {
        if (!user.authProvider || user.authProvider !== AuthProvider.GOOGLE) {
          await prisma.user.update({
            where: { id: user.id },
            data: { googleId, authProvider: AuthProvider.GOOGLE },
          });
        }
      }

      const accessToken = generateAccessToken(user.id, "user");
      const refreshToken = generateRefreshToken(user.id, "user");

      const userResponse = {
        ...user,
        id: user.id.toString(),
      };

      res.status(200).json({
        success: true,
        message: "Google authentication successful",
        data: {
          user: userResponse,
          tokens: {
            accessToken,
            refreshToken,
          },
        },
      });
    } catch (error: any) {
      console.error("Google auth error:", {
        message: error.message,
        code: error.code,
        stack: error.stack,
      });
      res.status(500).json({
        success: false,
        message:
          "An error occurred during Google authentication. Please try again.",
      });
    }
  },
);

export const continueWithApple = asyncHandler(
  async (req: Request, res: Response) => {
    const { appleId, email, firstName, lastName }: AppleAuthRequestBody =
      req.body;

    if (!appleId) {
      res.status(400).json({
        success: false,
        message: "Apple ID is required",
      });
      return;
    }

    if (email && !isValidEmail(email)) {
      res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
      return;
    }

    try {
      let user = await prisma.user.findFirst({
        where: {
          OR: [{ appleId }, ...(email ? [{ email }] : [])],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          gender: true,
          dob: true,
          emailVerifiedAt: true,
          phoneVerifiedAt: true,
          isActive: true,
          authProvider: true,
        },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            appleId,
            email: email ?? null,
            firstName: firstName ?? null,
            lastName: lastName ?? null,
            authProvider: AuthProvider.APPLE,
            emailVerifiedAt: email ? new Date() : null,
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            gender: true,
            dob: true,
            emailVerifiedAt: true,
            phoneVerifiedAt: true,
            isActive: true,
            authProvider: true,
          },
        });
      } else if (!user.isActive) {
        res.status(403).json({
          success: false,
          message: "This account has been deactivated.",
        });
        return;
      } else {
        if (!user.authProvider || user.authProvider !== AuthProvider.APPLE) {
          await prisma.user.update({
            where: { id: user.id },
            data: { appleId, authProvider: AuthProvider.APPLE },
          });
        }
      }

      const accessToken = generateAccessToken(user.id, "user");
      const refreshToken = generateRefreshToken(user.id, "user");

      const userResponse = {
        ...user,
        id: user.id.toString(),
      };

      res.status(200).json({
        success: true,
        message: "Apple authentication successful",
        data: {
          user: userResponse,
          tokens: {
            accessToken,
            refreshToken,
          },
        },
      });
    } catch (error: any) {
      console.error("Apple auth error:", {
        message: error.message,
        code: error.code,
        stack: error.stack,
      });
      res.status(500).json({
        success: false,
        message:
          "An error occurred during Apple authentication. Please try again.",
      });
    }
  },
);

export const verifyEmailCode = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const { email, code } = req.body;

    const result = await validateVerificationCode(email, code, 6);

    if (result.valid === false) {
      res.status(400).json({ success: false, message: result.message });
      return;
    }

    try {
      await prisma.user.update({
        where: { id: BigInt(userId) },
        data: {
          email: email,
          emailVerifiedAt: new Date(),
        },
      });

      res.status(200).json({
        success: true,
        message: "Email verified successfully",
      });
    } catch (error: any) {
      console.error("Error in verifyEmailCode:", error);
      res.status(500).json({
        success: false,
        message: "An internal server error occurred. Please try again.",
      });
    }
  },
);

export const deleteAccount = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }
    const userBigId = BigInt(userId);

    try {
      await prisma.$transaction([
        prisma.user.update({
          where: { id: userBigId },
          data: {
            isActive: false,
            deletedAt: new Date(),
            firstName: "Deleted",
            lastName: "User",
            email: null,
            phone: null,
            googleId: null,
            appleId: null,
            password: null,
            gender: null,
            dob: null,
            emailVerifiedAt: null,
            phoneVerifiedAt: null,
          },
        }),
        prisma.notification.deleteMany({ where: { userId: userBigId } }),
      ]);

      res.status(200).json({
        success: true,
        message: "Your account has been deleted. We're sorry to see you go.",
      });
    } catch (error: any) {
      console.error("Account deletion error:", error);
      res.status(500).json({
        success: false,
        message:
          "An error occurred while deleting your account. Please try again.",
      });
    }
  },
);
