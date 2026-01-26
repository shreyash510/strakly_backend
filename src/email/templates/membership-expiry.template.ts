import { baseTemplate } from './base.template';

export interface MembershipExpiryTemplateOptions {
  userName: string;
  gymName: string;
  expiryDate: string;
  daysRemaining: number;
  renewUrl?: string;
}

export function membershipExpiryTemplate(options: MembershipExpiryTemplateOptions): string {
  const { userName, gymName, expiryDate, daysRemaining, renewUrl = '#' } = options;

  const urgencyColor = daysRemaining <= 3 ? '#dc2626' : daysRemaining <= 7 ? '#f59e0b' : '#6366f1';
  const urgencyBgColor = daysRemaining <= 3 ? '#fef2f2' : daysRemaining <= 7 ? '#fffbeb' : '#eef2ff';

  const content = `
    <!-- Icon -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="center" style="padding-bottom: 24px;">
          <div style="width: 72px; height: 72px; background: linear-gradient(135deg, ${urgencyBgColor} 0%, ${urgencyBgColor} 100%); border-radius: 50%; display: inline-block; line-height: 72px; text-align: center;">
            <span style="font-size: 36px;">&#128197;</span>
          </div>
        </td>
      </tr>
    </table>

    <!-- Heading -->
    <h1 style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 24px; font-weight: 700; color: #1f2937; margin: 0 0 8px 0; text-align: center;">
      Membership Expiry Reminder
    </h1>

    <!-- Subheading -->
    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; color: #6b7280; margin: 0 0 32px 0; text-align: center;">
      Don't let your fitness journey pause
    </p>

    <!-- Greeting -->
    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; color: #374151; margin: 0 0 20px 0; line-height: 1.6;">
      Hi <strong>${userName}</strong>,
    </p>

    <!-- Message -->
    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; color: #374151; margin: 0 0 24px 0; line-height: 1.6;">
      This is a friendly reminder that your membership at <strong>${gymName}</strong> is expiring soon.
    </p>

    <!-- Expiry Info Box -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 32px;">
      <tr>
        <td style="padding: 24px; background-color: ${urgencyBgColor}; border-radius: 12px; border-left: 4px solid ${urgencyColor};">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td>
                <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #6b7280; margin: 0 0 8px 0;">
                  Expiry Date
                </p>
                <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 20px; font-weight: 700; color: #1f2937; margin: 0;">
                  ${expiryDate}
                </p>
              </td>
              <td align="right">
                <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #6b7280; margin: 0 0 8px 0;">
                  Days Remaining
                </p>
                <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 28px; font-weight: 700; color: ${urgencyColor}; margin: 0;">
                  ${daysRemaining}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Benefits reminder -->
    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; color: #374151; margin: 0 0 24px 0; line-height: 1.6;">
      Renew your membership to continue enjoying all the benefits and keep your fitness momentum going!
    </p>

    <!-- CTA Button -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="center" style="padding-bottom: 32px;">
          <a href="${renewUrl}" class="button" style="display: inline-block; padding: 16px 36px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; font-weight: 600; color: #ffffff; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 8px; text-decoration: none;">
            Renew Membership
          </a>
        </td>
      </tr>
    </table>

    <!-- Contact -->
    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #6b7280; margin: 0; line-height: 1.6; text-align: center;">
      Questions about renewal? Contact <strong>${gymName}</strong> directly or reach out to us.
    </p>
  `;

  return baseTemplate({
    preheader: `Your membership at ${gymName} expires on ${expiryDate}. ${daysRemaining} days remaining.`,
    content,
    footerText: `You received this email because you're a member of ${gymName}.`,
  });
}

export function membershipExpiryPlainText(options: MembershipExpiryTemplateOptions): string {
  const { userName, gymName, expiryDate, daysRemaining } = options;

  return `
Membership Expiry Reminder

Hi ${userName},

This is a friendly reminder that your membership at ${gymName} is expiring soon.

Expiry Date: ${expiryDate}
Days Remaining: ${daysRemaining}

Renew your membership to continue enjoying all the benefits and keep your fitness momentum going!

Questions about renewal? Contact ${gymName} directly.

---
Strakly
https://strakly.com
  `.trim();
}
