import nodemailer from "nodemailer";
import { emailTemplatesArray } from "./email.templates.js";
import { fillTemplate } from "./templates.helper.js";

// 1. Configure your Transporter
const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: Number(process.env.MAIL_PORT) || 465,
  secure: process.env.MAIL_ENCRYPTION === "ssl",
  auth: {
    user: process.env.MAIL_USERNAME,
    pass: process.env.MAIL_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

const GLOBAL_DEFAULTS = {
  appName: "Cho Delivery",
  //   supportEmail: "support@superplatform.com",
  // Add other constants like company address, website URL, etc.
};

export interface ReplacementData {
  [key: string]: string | number | undefined;
}

/**
 * Sends an email based on a specific template name.
 * @param to - Recipient email
 * @param templateName - Matches "TemplateName" in your array
 * @param replacementData - Data to fill {{placeholders}}
 * @returns Promise with email send info
 */
export const sendTemplateEmail = async (
  to: string,
  templateName: string,
  replacementData: ReplacementData = {}
): Promise<nodemailer.SentMessageInfo> => {
  try {
    // 2. Find the specific template object
    const finalData = { ...GLOBAL_DEFAULTS, ...replacementData };
    const template = emailTemplatesArray.find(
      (t) => t.TemplateName === templateName
    );

    if (!template) {
      throw new Error(`Template with name "${templateName}" not found.`);
    }

    // 3. Process the placeholders
    // We pass the Subject, Text, and HTML through our filler function
    const subject = fillTemplate(template.SubjectPart, finalData);
    const text = fillTemplate(template.TextPart, finalData);
    const html = fillTemplate(template.HtmlPart, finalData);

    // 4. Construct the mail options
    const mailOptions = {
      from: `"${GLOBAL_DEFAULTS.appName}" <${process.env.MAIL_FROM_ADDRESS}>`,
      to: to,
      subject: subject,
      text: text, // Fallback for clients that don't render HTML
      html: html,
    };

    // 5. Send
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};

// UseCase example:
// import { sendTemplateEmail } from './utils/emails/email.service.js';
// // Data required by 'App_Email_Verification' template:
// const emailData = {
//   userName: user.name,
//   verificationCode: "123-456-789"
// };

// // Trigger the email
// await sendTemplateEmail(
//   user.email,
//   "App_Email_Verification", // Must match TemplateName exactly
//   emailData
// );

