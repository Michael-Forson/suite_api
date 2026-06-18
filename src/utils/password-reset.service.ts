import { CodeType } from "../generated/prisma/enums.js";
import { createVerificationCode, consumeVerificationCode } from "./verificationCodes.js";
import { sendTemplateEmail } from "./emails/email.service.js";
import { sendSmsViaArkasel } from "./sms.js";
import { isValidEmail, isValidCode } from "./validators.js";

/**
 * Sends a 6-digit password reset code via email or SMS depending on the identifier.
 */
export const sendPasswordResetCode = async (
  identifier: string,
  options?: { firstName?: string; ttlMinutes?: number }
) => {
  const { firstName, ttlMinutes = 15 } = options || {};

  const codeRecord = await createVerificationCode(
    identifier,
    CodeType.RESET,
    ttlMinutes,
    6
  );

  if (isValidEmail(identifier)) {
    await sendTemplateEmail(identifier, "App_Password_Reset", {
      userName: firstName || "",
      verificationCode: codeRecord.code,
      appName: "CHO",
    });
  } else {
    await sendSmsViaArkasel({
      to: identifier,
      sms: `Your CHO password reset code is ${codeRecord.code}. It expires in ${ttlMinutes} minutes. If you didn't request this, ignore this message.`,
    });
  }

  return codeRecord;
};

/**
 * Validates and consumes a RESET verification code.
 * Returns { valid: true } on success, or { valid: false, message: string } on failure.
 */
export const validateAndConsumeResetCode = async (
  identifier: string,
  code: string
): Promise<{ valid: true } | { valid: false; message: string }> => {
  if (!isValidCode(code, 6)) {
    return { valid: false, message: "Invalid code format. Code must be 6 digits." };
  }

  const result = await consumeVerificationCode(identifier, code, CodeType.RESET);

  if (!result.valid) {
    return {
      valid: false,
      message:
        result.reason === "expired"
          ? "Reset code has expired. Please request a new one."
          : "Invalid or incorrect reset code.",
    };
  }

  return { valid: true };
};
