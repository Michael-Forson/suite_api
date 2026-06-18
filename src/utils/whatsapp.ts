import https from "node:https";
import { URL } from "node:url";

export interface SendWhatsAppOtpParams {
  to: string;
  code: string;
}

export interface SendWhatsAppOtpResult {
  success: boolean;
  message?: string;
  data?: any;
}

export const sendWhatsAppOtp = async ({
  to,
  code,
}: SendWhatsAppOtpParams): Promise<SendWhatsAppOtpResult> => {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const templateName = process.env.WHATSAPP_OTP_TEMPLATE_NAME;

  if (!phoneNumberId || !accessToken || !templateName) {
    throw new Error("Missing WhatsApp configuration environment variables");
  }

  const url = new URL(
    `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
  );

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: "en" },
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: code }],
        },
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: code }],
        },
      ],
    },
  };

  const body = JSON.stringify(payload);

  return new Promise<SendWhatsAppOtpResult>((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk.toString();
        });
        res.on("end", () => {
          try {
            const response = JSON.parse(data);
            if (
              res.statusCode &&
              res.statusCode >= 200 &&
              res.statusCode < 300
            ) {
              resolve({
                success: true,
                message: "WhatsApp OTP sent successfully",
                data: response,
              });
            } else {
              reject(
                new Error(
                  `${response.error?.message || `WhatsApp API error: ${res.statusCode}`} (template: ${templateName})`,
                ),
              );
            }
          } catch {
            reject(
              new Error(`WhatsApp API returned non-JSON response: ${data}`),
            );
          }
        });
      },
    );

    req.on("error", (error) => {
      reject(
        new Error(`Network error while sending WhatsApp OTP: ${error.message}`),
      );
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error("WhatsApp request timeout"));
    });

    req.write(body);
    req.end();
  });
};
