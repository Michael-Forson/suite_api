import { CodeType } from "../generated/prisma/enums.js";
import { prisma } from "../prisma.js";

export const generateNumericCode = (length = 6) => {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return Math.floor(Math.random() * (max - min + 1) + min).toString();
};

export const createVerificationCode = async (
  identifier: string,
  type: CodeType,
  ttlMinutes = 15,
  codeLength = 6
) => {
  const code = generateNumericCode(codeLength);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  await prisma.verificationCode.create({
    data: { identifier, code, type, expiresAt },
  });
  return { code, expiresAt };
};

export const consumeVerificationCode = async (
  identifier: string,
  code: string,
  type: CodeType
) => {
  const record = await prisma.verificationCode.findFirst({
    where: { identifier, code, type },
    orderBy: { createdAt: "desc" },
  });

  if (!record) return { valid: false, reason: "not_found" as const };
  if (new Date() > record.expiresAt) {
    return { valid: false, reason: "expired" as const };
  }

  await prisma.verificationCode.delete({ where: { id: record.id } });

  return { valid: true as const, record };
};
