import { baseTemplate } from './base.template';

export interface PasswordResetOtpTemplateOptions {
  userName: string;
  otp: string;
  expiryMinutes: number;
}

export function passwordResetOtpTemplate(
  options: PasswordResetOtpTemplateOptions,
): string {
  const { userName, otp, expiryMinutes } = options;

  const content = `
    <h1 style="font-size: 22px; font-weight: 600; color: #0f172a; margin: 0 0 8px 0; text-align: center;">
      Reset your password
    </h1>
    <p style="font-size: 15px; color: #64748b; margin: 0 0 32px 0; text-align: center;">
      Use this code to reset your password
    </p>

    <p style="font-size: 15px; color: #334155; margin: 0 0 24px 0; line-height: 1.6;">
      Hi ${userName},
    </p>

    <p style="font-size: 15px; color: #334155; margin: 0 0 32px 0; line-height: 1.6;">
      We received a request to reset your password. Enter the code below to proceed:
    </p>

    <!-- OTP Code -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="center" style="padding: 0 0 24px 0;">
          <div class="otp-code" style="display: inline-block; background-color: #f1f5f9; border-radius: 8px; padding: 20px 32px;">
            <span style="font-family: 'SF Mono', Monaco, 'Courier New', monospace; font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #0f172a;">
              ${otp}
            </span>
          </div>
        </td>
      </tr>
    </table>

    <p style="font-size: 13px; color: #64748b; margin: 0 0 32px 0; text-align: center;">
      This code expires in <strong>${expiryMinutes} minutes</strong>
    </p>

    <div style="border-top: 1px solid #e2e8f0; padding-top: 24px;">
      <p style="font-size: 13px; color: #94a3b8; margin: 0; line-height: 1.6;">
        If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
      </p>
    </div>
  `;

  return baseTemplate({
    preheader: `Your password reset code is ${otp}`,
    content,
    footerText:
      'You received this email because a password reset was requested for your account.',
  });
}

export function passwordResetOtpPlainText(
  options: PasswordResetOtpTemplateOptions,
): string {
  const { userName, otp, expiryMinutes } = options;

  return `
Reset your password

Hi ${userName},

We received a request to reset your password. Enter the code below to proceed:

Your code: ${otp}

This code expires in ${expiryMinutes} minutes.

If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.

---
Strakly
https://strakly.com
  `.trim();
}
