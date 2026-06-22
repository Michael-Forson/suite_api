export type Gender = "MALE" | "FEMALE" | "OTHER";

export interface RegisterRequestBody {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  password: string;
  gender?: Gender;
  dob?: string;
}

export interface VerifyPhoneCodeRequestBody {
  phone: string;
  code: string;
  type?: "ACTIVATION" | "LOGIN";
}

export interface SendEmailCodeRequestBody {}

export interface VerifyEmailCodeRequestBody {
  email: string;
  code: string;
}

export interface LoginRequestBody {
  phone?: string;
  email?: string;
  password: string;
}

export interface RequestPasswordResetBody {
  phone?: string;
  email?: string;
}

export interface ResetPasswordBody {
  phone?: string;
  email?: string;
  code: string;
  password: string;
}

export interface SendCodeRequestBody {
  phone: string;
  type?: "ACTIVATION" | "LOGIN";
  channel?: "sms" | "whatsapp" | "both";
}

export interface RefreshTokenRequestBody {
  refreshToken: string;
}

export interface UpdateProfileRequestBody {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  gender?: Gender;
  dob?: string;
}

export interface GoogleAuthRequestBody {
  email: string;
  googleId: string;
}

export interface AppleAuthRequestBody {
  appleId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}
