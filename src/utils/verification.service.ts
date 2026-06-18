import { CodeType } from "../generated/prisma/enums.js";
import { createVerificationCode, consumeVerificationCode } from "./verificationCodes.js";
import { sendTemplateEmail } from "./emails/email.service.js";
import { dispatchOtp } from "./otp.js";
import { isValidCode } from "./validators.js";

export type { OtpChannel } from "./otp.js";

/**
 * Sends a verification code via email.
 * Creates the code in DB and delivers it using the App_Email_Verification template.
 */
export const sendEmailVerificationCode = async (
  email: string,
  options?: { userName?: string; codeLength?: number; ttlMinutes?: number }
) => {
  const { userName, codeLength = 6, ttlMinutes = 15 } = options || {};

  const codeRecord = await createVerificationCode(
    email,
    CodeType.ACTIVATION,
    ttlMinutes,
    codeLength,
  );

  await sendTemplateEmail(email, "App_Email_Verification", {
    userName: userName || "",
    verificationCode: codeRecord.code,
  });

  return codeRecord;
};

/**
 * Creates one verification code and delivers it via SMS, WhatsApp, or both.
 */
export const sendPhoneVerificationCode = async (
  phone: string,
  options?: { channel?: import("./otp.js").OtpChannel; codeLength?: number; ttlMinutes?: number },
) => {
  const { channel = "both", codeLength = 6, ttlMinutes = 15 } = options || {};

  const codeRecord = await createVerificationCode(
    phone,
    CodeType.ACTIVATION,
    ttlMinutes,
    codeLength,
  );

  await dispatchOtp(phone, codeRecord.code, channel, ttlMinutes);

  return codeRecord;
};

export const sendSmsVerificationCode = async (
  phone: string,
  options?: { codeLength?: number; ttlMinutes?: number },
) => sendPhoneVerificationCode(phone, { ...options, channel: "sms" });

/**
 * Validates and consumes a verification code.
 * Returns { valid: true } on success, or { valid: false, message: string } on failure.
 */
export const validateVerificationCode = async (
  identifier: string,
  code: string,
  codeLength = 6,
): Promise<{ valid: true } | { valid: false; message: string }> => {
  if (!isValidCode(code, codeLength)) {
    return {
      valid: false,
      message: `Invalid verification code format. Code must be ${codeLength} digits.`,
    };
  }

  const result = await consumeVerificationCode(
    identifier,
    code,
    CodeType.ACTIVATION,
  );

  if (!result.valid) {
    return {
      valid: false,
      message: result.reason === "expired"
        ? "Verification code has expired. Please request a new one."
        : "Invalid or incorrect verification code",
    };
  }

  return { valid: true };
};
