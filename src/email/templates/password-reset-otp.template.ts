import { baseTemplate } from './base.template';

export interface PasswordResetOtpTemplateOptions {
  userName: string;
  otp: string;
  expiryMinutes: number;
}

export function passwordResetOtpTemplate(options: PasswordResetOtpTemplateOptions): string {
  const { userName, otp, expiryMinutes } = options;

  const content = `
    <!-- Icon -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="center" style="padding-bottom: 24px;">
          <div style="width: 72px; height: 72px; background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 50%; display: inline-block; line-height: 72px; text-align: center;">
            <span style="font-size: 36px;">&#128274;</span>
          </div>
        </td>
      </tr>
    </table>

    <!-- Heading -->
    <h1 style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 24px; font-weight: 700; color: #1f2937; margin: 0 0 8px 0; text-align: center;">
      Password Reset Request
    </h1>

    <!-- Subheading -->
    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; color: #6b7280; margin: 0 0 32px 0; text-align: center;">
      Use this code to reset your password
    </p>

    <!-- Greeting -->
    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; color: #374151; margin: 0 0 20px 0; line-height: 1.6;">
      Hi <strong>${userName}</strong>,
    </p>

    <!-- Message -->
    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; color: #374151; margin: 0 0 32px 0; line-height: 1.6;">
      We received a request to reset your password. Enter the following verification code to proceed:
    </p>

    <!-- OTP Code -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="center" style="padding-bottom: 32px;">
          <span class="otp-code" style="font-family: 'SF Mono', Monaco, 'Courier New', monospace; font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #1f2937; background-color: #f3f4f6; padding: 20px 32px; border-radius: 12px; border: 2px dashed #d1d5db; display: inline-block;">
            ${otp}
          </span>
        </td>
      </tr>
    </table>

    <!-- Expiry Notice -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="center" style="padding-bottom: 32px;">
          <div style="display: inline-block; background-color: #fef3c7; border-radius: 8px; padding: 12px 20px;">
            <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #92400e;">
              &#9888; This code expires in <strong>${expiryMinutes} minutes</strong>
            </span>
          </div>
        </td>
      </tr>
    </table>

    <!-- Divider -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td style="padding: 0 0 24px 0;">
          <div style="height: 1px; background-color: #e5e7eb;"></div>
        </td>
      </tr>
    </table>

    <!-- Security Notice -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f9fafb; border-radius: 8px;">
      <tr>
        <td style="padding: 20px;">
          <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #6b7280; margin: 0 0 12px 0; line-height: 1.5;">
            <strong style="color: #374151;">Didn't request this?</strong>
          </p>
          <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #6b7280; margin: 0; line-height: 1.5;">
            If you didn't request a password reset, please ignore this email or contact support if you have concerns about your account security.
          </p>
        </td>
      </tr>
    </table>
  `;

  return baseTemplate({
    preheader: `Your password reset code is ${otp}. It expires in ${expiryMinutes} minutes.`,
    content,
    footerText: 'You received this email because a password reset was requested for your account.',
  });
}

export function passwordResetOtpPlainText(options: PasswordResetOtpTemplateOptions): string {
  const { userName, otp, expiryMinutes } = options;

  return `
Password Reset Request

Hi ${userName},

We received a request to reset your password. Use the following verification code to proceed:

Your OTP Code: ${otp}

This code expires in ${expiryMinutes} minutes.

If you didn't request this password reset, please ignore this email or contact support if you have concerns.

---
Strakly
https://strakly.com
  `.trim();
}
