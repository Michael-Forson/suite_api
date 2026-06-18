import { sendSmsViaArkasel } from "./sms.js";
import { sendWhatsAppOtp } from "./whatsapp.js";

export type OtpChannel = "sms" | "whatsapp" | "both";

/**
 * Dispatches an already-generated OTP code to the specified channel(s).
 * Each channel fails independently — one failure never affects the other.
 */
export const dispatchOtp = async (
  phone: string,
  code: string,
  channel: OtpChannel = "both",
  ttlMinutes = 15,
): Promise<void> => {
  const sends: Promise<any>[] = [];

  if (channel === "sms" || channel === "both") {
    sends.push(
      sendSmsViaArkasel({
        to: phone,
        sms: `Your Cho verification code is ${code}. It expires in ${ttlMinutes} minutes.`,
      }).catch((err) => console.error("SMS OTP send error:", err?.message)),
    );
  }

  if (channel === "whatsapp" || channel === "both") {
    sends.push(
      sendWhatsAppOtp({ to: phone, code }).catch((err) =>
        console.error("WhatsApp OTP send error:", err?.message),
      ),
    );
  }

  await Promise.all(sends);
};
