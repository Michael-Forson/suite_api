import { jest } from "@jest/globals";

export const mockedSendTemplateEmail = jest
  .fn<
    (
      to: string,
      templateName: string,
      replacementData?: Record<string, string | number | undefined>,
    ) => Promise<{ messageId: string }>
  >()
  .mockResolvedValue({ messageId: "test-email" });

(jest as any).unstable_mockModule("../utils/emails/email.service.js", () => ({
  sendTemplateEmail: mockedSendTemplateEmail,
}));

const { createApp } = await import("../createApp.js");
export const app = createApp();
