import { OAuth2Client } from "google-auth-library";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export interface VerifiedGoogleIdentity {
  googleId: string;
  email: string;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
}

export const verifyGoogleIdToken = async (
  idToken: string,
): Promise<VerifiedGoogleIdentity | null> => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    throw new Error("GOOGLE_CLIENT_ID is not configured");
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.sub || !payload.email) {
      return null;
    }

    return {
      googleId: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified ?? false,
      firstName: payload.given_name ?? null,
      lastName: payload.family_name ?? null,
    };
  } catch {
    return null;
  }
};
