import { baseTemplate } from './base.template';

export interface PasswordResetSuccessTemplateOptions {
  userName: string;
  loginUrl?: string;
}

export function passwordResetSuccessTemplate(options: PasswordResetSuccessTemplateOptions): string {
  const { userName, loginUrl = 'https://app.strakly.com/login' } = options;

  const content = `
    <!-- Icon -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="center" style="padding-bottom: 24px;">
          <div style="width: 72px; height: 72px; background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); border-radius: 50%; display: inline-block; line-height: 72px; text-align: center;">
            <span style="font-size: 36px;">&#128274;</span>
          </div>
        </td>
      </tr>
    </table>

    <!-- Heading -->
    <h1 style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 24px; font-weight: 700; color: #1f2937; margin: 0 0 8px 0; text-align: center;">
      Password Reset Successful
    </h1>

    <!-- Subheading -->
    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; color: #6b7280; margin: 0 0 32px 0; text-align: center;">
      Your password has been updated
    </p>

    <!-- Greeting -->
    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; color: #374151; margin: 0 0 20px 0; line-height: 1.6;">
      Hi <strong>${userName}</strong>,
    </p>

    <!-- Message -->
    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; color: #374151; margin: 0 0 24px 0; line-height: 1.6;">
      Your password has been successfully reset. You can now log in with your new password.
    </p>

    <!-- Success Box -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 32px;">
      <tr>
        <td style="padding: 20px 24px; background-color: #d1fae5; border-radius: 8px; border-left: 4px solid #059669;">
          <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #065f46; margin: 0;">
            &#10003; Your password was changed on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </td>
      </tr>
    </table>

    <!-- CTA Button -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="center" style="padding-bottom: 32px;">
          <a href="${loginUrl}" class="button" style="display: inline-block; padding: 16px 36px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; font-weight: 600; color: #ffffff; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 8px; text-decoration: none;">
            Log In Now
          </a>
        </td>
      </tr>
    </table>

    <!-- Security Notice -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #fef3c7; border-radius: 8px;">
      <tr>
        <td style="padding: 20px;">
          <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #92400e; margin: 0; line-height: 1.5;">
            <strong>&#9888; Security Notice:</strong> If you did not make this change, please contact support immediately at
            <a href="mailto:support@strakly.com" style="color: #92400e; text-decoration: underline;">support@strakly.com</a>
          </p>
        </td>
      </tr>
    </table>
  `;

  return baseTemplate({
    preheader: 'Your password has been successfully reset.',
    content,
    footerText: 'You received this email because your password was changed.',
  });
}

export function passwordResetSuccessPlainText(options: PasswordResetSuccessTemplateOptions): string {
  const { userName, loginUrl = 'https://app.strakly.com/login' } = options;

  return `
Password Reset Successful

Hi ${userName},

Your password has been successfully reset. You can now log in with your new password.

Log in: ${loginUrl}

Security Notice: If you did not make this change, please contact support immediately at support@strakly.com

---
Strakly
https://strakly.com
  `.trim();
}
