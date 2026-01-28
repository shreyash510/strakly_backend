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

  const isUrgent = daysRemaining <= 3;
  const alertColor = isUrgent ? '#dc2626' : '#f59e0b';
  const alertBgColor = isUrgent ? '#fef2f2' : '#fffbeb';
  const alertBorderColor = isUrgent ? '#fecaca' : '#fef3c7';

  const content = `
    <h1 style="font-size: 22px; font-weight: 600; color: #0f172a; margin: 0 0 8px 0; text-align: center;">
      Membership expiring soon
    </h1>
    <p style="font-size: 15px; color: #64748b; margin: 0 0 32px 0; text-align: center;">
      Don't let your progress pause
    </p>

    <p style="font-size: 15px; color: #334155; margin: 0 0 24px 0; line-height: 1.6;">
      Hi ${userName},
    </p>

    <p style="font-size: 15px; color: #334155; margin: 0 0 24px 0; line-height: 1.6;">
      This is a friendly reminder that your membership at <strong>${gymName}</strong> is expiring soon.
    </p>

    <!-- Expiry Info -->
    <div style="background-color: ${alertBgColor}; border: 1px solid ${alertBorderColor}; border-radius: 8px; padding: 20px 24px; margin-bottom: 32px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td>
            <p style="font-size: 13px; color: #64748b; margin: 0 0 4px 0;">Expires on</p>
            <p style="font-size: 18px; font-weight: 600; color: #0f172a; margin: 0;">${expiryDate}</p>
          </td>
          <td align="right">
            <p style="font-size: 13px; color: #64748b; margin: 0 0 4px 0;">Days left</p>
            <p style="font-size: 24px; font-weight: 700; color: ${alertColor}; margin: 0;">${daysRemaining}</p>
          </td>
        </tr>
      </table>
    </div>

    <p style="font-size: 15px; color: #334155; margin: 0 0 32px 0; line-height: 1.6;">
      Renew your membership to continue enjoying all the benefits and keep your fitness momentum going.
    </p>

    <!-- CTA Button -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="center" style="padding: 0 0 32px 0;">
          <a href="${renewUrl}" style="display: inline-block; padding: 14px 28px; font-size: 15px; font-weight: 600; color: #ffffff; background-color: #4f46e5; border-radius: 8px; text-decoration: none;">
            Renew membership
          </a>
        </td>
      </tr>
    </table>

    <p style="font-size: 13px; color: #94a3b8; margin: 0; text-align: center; line-height: 1.6;">
      Questions? Contact <strong>${gymName}</strong> or reach out at <a href="mailto:support@strakly.com" style="color: #4f46e5;">support@strakly.com</a>
    </p>
  `;

  return baseTemplate({
    preheader: `Your membership expires on ${expiryDate}. ${daysRemaining} days remaining.`,
    content,
    footerText: `You received this email because you're a member of ${gymName}.`,
  });
}

export function membershipExpiryPlainText(options: MembershipExpiryTemplateOptions): string {
  const { userName, gymName, expiryDate, daysRemaining } = options;

  return `
Membership expiring soon

Hi ${userName},

This is a friendly reminder that your membership at ${gymName} is expiring soon.

Expires on: ${expiryDate}
Days remaining: ${daysRemaining}

Renew your membership to continue enjoying all the benefits and keep your fitness momentum going.

Questions? Contact ${gymName} or reach out at support@strakly.com

---
Strakly
https://strakly.com
  `.trim();
}
