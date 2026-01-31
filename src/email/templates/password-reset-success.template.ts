import { baseTemplate } from './base.template';

export interface PasswordResetSuccessTemplateOptions {
  userName: string;
  loginUrl?: string;
}

export function passwordResetSuccessTemplate(
  options: PasswordResetSuccessTemplateOptions,
): string {
  const { userName, loginUrl = 'https://app.strakly.com/login' } = options;

  const content = `
    <h1 style="font-size: 22px; font-weight: 600; color: #0f172a; margin: 0 0 8px 0; text-align: center;">
      Password updated
    </h1>
    <p style="font-size: 15px; color: #64748b; margin: 0 0 32px 0; text-align: center;">
      Your password has been successfully changed
    </p>

    <p style="font-size: 15px; color: #334155; margin: 0 0 24px 0; line-height: 1.6;">
      Hi ${userName},
    </p>

    <p style="font-size: 15px; color: #334155; margin: 0 0 32px 0; line-height: 1.6;">
      Your password has been successfully reset. You can now log in with your new password.
    </p>

    <!-- Success Box -->
    <div style="background-color: #f0fdf4; border-left: 4px solid #22c55e; border-radius: 4px; padding: 16px 20px; margin-bottom: 32px;">
      <p style="font-size: 14px; color: #166534; margin: 0;">
        Password changed on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
      </p>
    </div>

    <!-- CTA Button -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="center" style="padding: 0 0 32px 0;">
          <a href="${loginUrl}" style="display: inline-block; padding: 14px 28px; font-size: 15px; font-weight: 600; color: #ffffff; background-color: #4f46e5; border-radius: 8px; text-decoration: none;">
            Log in to your account
          </a>
        </td>
      </tr>
    </table>

    <div style="border-top: 1px solid #e2e8f0; padding-top: 24px;">
      <p style="font-size: 13px; color: #94a3b8; margin: 0; line-height: 1.6;">
        If you didn't make this change, please contact us immediately at <a href="mailto:support@strakly.com" style="color: #4f46e5;">support@strakly.com</a>
      </p>
    </div>
  `;

  return baseTemplate({
    preheader: 'Your password has been successfully reset',
    content,
    footerText: 'You received this email because your password was changed.',
  });
}

export function passwordResetSuccessPlainText(
  options: PasswordResetSuccessTemplateOptions,
): string {
  const { userName, loginUrl = 'https://app.strakly.com/login' } = options;

  return `
Password updated

Hi ${userName},

Your password has been successfully reset. You can now log in with your new password.

Log in: ${loginUrl}

If you didn't make this change, please contact us immediately at support@strakly.com

---
Strakly
https://strakly.com
  `.trim();
}
