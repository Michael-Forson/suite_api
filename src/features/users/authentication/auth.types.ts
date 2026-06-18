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

export interface VerifyCodeRequestBody {
  phone?: string;
  email?: string;
  code: string;
  type?: "ACTIVATION" | "RESET" | "LOGIN";
}

export interface SendEmailCodeRequestBody {}

export interface VerifyEmailCodeRequestBody {
  code: string;
}

export interface LoginRequestBody {
  phone: string;
}

export interface SendCodeRequestBody {
  phone?: string;
  email?: string;
  type?: "ACTIVATION" | "RESET" | "LOGIN";
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
