export interface EmailTemplate {
  TemplateName: string;
  SubjectPart: string;
  TextPart: string;
  HtmlPart: string;
}

export const emailTemplatesArray: EmailTemplate[] = [
  {
    TemplateName: "App_Email_Verification",
    SubjectPart: "Your {{appName}} Verification Code",
    TextPart:
      "Welcome to {{appName}}! Your email verification code is: {{verificationCode}}. This code expires in 15 minutes.",
    HtmlPart:
      '<html><body><h2>Welcome to {{appName}}!</h2><p>Your email verification code is:</p><h1 style="letter-spacing: 8px; font-size: 32px;">{{verificationCode}}</h1><p>This code expires in 15 minutes.</p></body></html>',
  },
  {
    TemplateName: "App_Password_Reset",
    SubjectPart: "Reset Your {{appName}} Password",
    TextPart:
      "Hi {{userName}}, your password reset code is: {{verificationCode}}. It expires in 15 minutes. If you didn't request this, ignore this email.",
    HtmlPart:
      '<html><body><h2>Reset Your Password</h2><p>Hi {{userName}},</p><p>Your password reset code is:</p><h1 style="letter-spacing: 8px; font-size: 32px;">{{verificationCode}}</h1><p>This code expires in 15 minutes.</p><p>If you didn\'t request a password reset, you can safely ignore this email.</p></body></html>',
  },
  {
    TemplateName: "App_ReEngagement_Checkin",
    SubjectPart: "We Miss You, {{userName}}! See What's New at {{appName}}",
    TextPart:
      "Check out our new feature: {{feature1}}. Log in here: {{loginLink}}",
    HtmlPart:
      '<html><body><h2>Hey {{userName}},</h2><p>Check out: {{feature1}}</p><a href="{{loginLink}}">Log Back In</a></body></html>',
  },
  {
    TemplateName: "App_Invoice",
    SubjectPart:
      "Your {{appName}} Invoice ({{invoiceNumber}}) - ${{totalAmount}} Charged",
    TextPart:
      "Invoice No: {{invoiceNumber}}, Amount: ${{totalAmount}}. View full invoice here: {{invoicePDFLink}}",
    HtmlPart:
      '<html><body><h2>Invoice #{{invoiceNumber}}</h2><p>Payment of <strong>${{totalAmount}}</strong> received.</p><a href="{{invoicePDFLink}}">View PDF</a></body></html>',
  },
  {
    TemplateName: "App_Subscription_Renewal",
    SubjectPart: "Heads Up! Your {{appName}} Subscription Renews Soon",
    TextPart:
      "Your subscription renews on {{renewalDate}} for ${{renewalAmount}}. Manage here: {{dashboardLink}}",
    HtmlPart:
      '<html><body><p>Subscription renews on <strong>{{renewalDate}}</strong> for <strong>${{renewalAmount}}</strong>.</p><a href="{{dashboardLink}}">Go to My Account</a></body></html>',
  },
  {
    TemplateName: "App_Subscription_Expiration",
    SubjectPart: "Action Required: Your {{appName}} Subscription Has Expired",
    TextPart:
      "Your {{subscriptionPlan}} subscription has expired. Update your payment to restore service: {{paymentLink}}",
    HtmlPart:
      '<html><body><p>Your subscription has expired. Restore service:</p><a href="{{paymentLink}}">Update Payment Details</a></body></html>',
  },
  {
    TemplateName: "App_Downtime_Notice",
    SubjectPart: "Important: Planned Maintenance for {{appName}}",
    TextPart:
      "Planned maintenance from {{startTime}} to {{endTime}} UTC. Service may be unavailable.",
    HtmlPart:
      "<html><body><p>Scheduled maintenance from <strong>{{startTime}}</strong> to <strong>{{endTime}}</strong> UTC.</p></body></html>",
  },
  {
    TemplateName: "App_Feature_Announcement",
    SubjectPart: "New Feature Alert: {{featureName}} is Live!",
    TextPart: "New feature {{featureName}}! Check it out now: {{featureLink}}",
    HtmlPart:
      '<html><body><h2>New Feature: {{featureName}}</h2><a href="{{featureLink}}">Try it Now</a></body></html>',
  },
  {
    TemplateName: "App_Survey_Request",
    SubjectPart: "We Value Your Feedback! Take Our Quick Survey",
    TextPart: "Help us improve {{appName}}! Take our survey: {{surveyLink}}",
    HtmlPart:
      '<html><body><p>Please complete our quick survey:</p><a href="{{surveyLink}}">Start Survey</a></body></html>',
  },
  {
    TemplateName: "App_New_Device_Login_Alert",
    SubjectPart: "Security Alert: New Sign-In to Your Account",
    TextPart:
      "Login from {{deviceDetails}} in {{location}}. If not you, secure your account: {{securityLink}}",
    HtmlPart:
      '<html><body><p>Login from <strong>{{deviceDetails}}</strong>.</p><p><a href="{{securityLink}}">Secure Your Account Now</a>.</p></body></html>',
  },
  {
    TemplateName: "App_Suspicious_Activity",
    SubjectPart: "Important Security Notice: Suspicious Activity Detected",
    TextPart:
      "Suspicious activity detected. Change your password immediately: {{changePasswordLink}}",
    HtmlPart:
      '<html><body><p>Suspicious activity detected.</p><a href="{{changePasswordLink}}">Change Password</a></body></html>',
  },
  {
    TemplateName: "App_Terms_Privacy_Update",
    SubjectPart: "Update to Our Terms of Service & Privacy Policy",
    TextPart:
      "Updates effective {{effectiveDate}}. Review here: {{termsLink}} | {{privacyLink}}",
    HtmlPart:
      '<html><body><p>Updates effective <strong>{{effectiveDate}}</strong>.</p><p><a href="{{termsLink}}">Terms</a> | <a href="{{privacyLink}}">Privacy</a></p></body></html>',
  },
  {
    TemplateName: "Admin_Verification_Approved",
    SubjectPart: "Your {{appName}} Account Has Been Verified!",
    TextPart:
      "Hi {{name}}, congratulations! Your account on {{appName}} has been verified. You can now access all features. Welcome aboard!",
    HtmlPart:
      "<html><body><h2>You're Verified!</h2><p>Hi {{name}},</p><p>Congratulations! Your account on <strong>{{appName}}</strong> has been verified. You can now access all features.</p><p>Welcome aboard!</p></body></html>",
  },
  {
    TemplateName: "Admin_Verification_Rejected",
    SubjectPart: "Your {{appName}} Verification Was Unsuccessful",
    TextPart:
      "Hi {{name}}, unfortunately your verification on {{appName}} was not successful. Reason: {{reason}}. Please review the requirements and resubmit. If you have questions, contact support.",
    HtmlPart:
      "<html><body><h2>Verification Unsuccessful</h2><p>Hi {{name}},</p><p>Unfortunately your verification on <strong>{{appName}}</strong> was not successful.</p><p><strong>Reason:</strong> {{reason}}</p><p>Please review the requirements and resubmit. If you have questions, contact support.</p></body></html>",
  },
  {
    TemplateName: "Admin_Account_Blocked",
    SubjectPart: "Your {{appName}} Account Has Been Suspended",
    TextPart:
      "Hi {{name}}, your {{appName}} account has been suspended. Reason: {{reason}}. Contact support if you believe this is an error.",
    HtmlPart:
      "<html><body><h2>Account Suspended</h2><p>Hi {{name}},</p><p>Your <strong>{{appName}}</strong> account has been suspended.</p><p><strong>Reason:</strong> {{reason}}</p><p>Contact support if you believe this is an error.</p></body></html>",
  },
  {
    TemplateName: "Admin_Invite",
    SubjectPart: "Set up your {{appName}} admin account",
    TextPart:
      "Hi {{name}}, you've been invited to the {{appName}} admin dashboard. Set your password here: {{setupLink}}. This link expires in {{expiresInHours}} hours. If you were not expecting this invitation, ignore this email.",
    HtmlPart:
      '<html><body><h2>Set up your admin account</h2><p>Hi {{name}},</p><p>You have been invited to the {{appName}} admin dashboard.</p><p><a href="{{setupLink}}">Set your password</a></p><p>This link expires in {{expiresInHours}} hours.</p></body></html>',
  },
];

