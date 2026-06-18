import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

export interface SendSmsParams {
  to: string;
  sms: string;
  from?: string;
}

export interface SendSmsResult {
  success: boolean;
  message?: string;
  data?: any;
}

/**
 * Sends an SMS via ArkAsel by issuing a GET request with query params.
 * API: https://sms.arkesel.com/sms/api?action=send-sms&api_key=KEY&to=Phone&from=SenderID&sms=Message
 */
export const sendSmsViaArkasel = async ({
  to,
  sms,
  from,
}: SendSmsParams): Promise<SendSmsResult> => {
  const senderId = from || process.env.ARKASEL_SENDER_ID || "PentaTech";
  const baseUrl =
    process.env.ARKASEL_SMS_URL || "https://sms.arkesel.com/sms/api";
  const apiKey = process.env.ARKASEL_SMS_API_KEY;

  if (!apiKey) {
    throw new Error("Missing ARKASEL_SMS_API_KEY environment variable");
  }

  const url = new URL(baseUrl);
  url.searchParams.set("action", "send-sms");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("to", to);
  url.searchParams.set("from", senderId);
  url.searchParams.set("sms", sms);

  const client = url.protocol === "https:" ? https : http;

  return new Promise<SendSmsResult>((resolve, reject) => {
    const req = client.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk.toString();
      });
      res.on("end", () => {
        try {
          // Arkasel returns JSON response (e.g. { code: "ok", message: "Successfully Sent", ... })
          const response = JSON.parse(data);

          // Check if the response indicates success
          if (
            response.status === "success" ||
            response.code === "100" ||
            response.statusCode === 200 ||
            response.code === "ok" ||
            response.message === "Successfully Sent"
          ) {
            resolve({
              success: true,
              message: response.message || "SMS sent successfully",
              data: response,
            });
          } else {
            reject(
              new Error(
                response.message || response.error || "Failed to send SMS"
              )
            );
          }
        } catch (parseError) {
          // If response is not JSON, check HTTP status
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve({
              success: true,
              message: "SMS sent successfully",
              data: data,
            });
          } else {
            reject(
              new Error(`SMS API returned status ${res.statusCode}: ${data}`)
            );
          }
        }
      });
    });

    req.on("error", (error) => {
      reject(new Error(`Network error while sending SMS: ${error.message}`));
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error("SMS request timeout"));
    });
  });
};
