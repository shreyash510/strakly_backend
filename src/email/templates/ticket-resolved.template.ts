import { baseTemplate } from './base.template';

export interface TicketResolvedTemplateOptions {
  userName: string;
  ticketNumber: string;
  subject: string;
  resolution?: string;
}

export function ticketResolvedTemplate(
  options: TicketResolvedTemplateOptions,
): string {
  const { userName, ticketNumber, subject, resolution } = options;

  const content = `
    <h1 style="font-size: 22px; font-weight: 600; color: #0f172a; margin: 0 0 8px 0; text-align: center;">
      Your Support Ticket is Resolved
    </h1>
    <p style="font-size: 15px; color: #64748b; margin: 0 0 32px 0; text-align: center;">
      Ticket #${ticketNumber}
    </p>

    <p style="font-size: 15px; color: #334155; margin: 0 0 24px 0; line-height: 1.6;">
      Hi ${userName},
    </p>

    <p style="font-size: 15px; color: #334155; margin: 0 0 24px 0; line-height: 1.6;">
      Great news! Your support ticket has been resolved.
    </p>

    <!-- Ticket Details -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
      <tr>
        <td style="background-color: #f1f5f9; border-radius: 8px; padding: 20px;">
          <p style="font-size: 13px; color: #64748b; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.5px;">
            Subject
          </p>
          <p style="font-size: 15px; color: #0f172a; margin: 0; font-weight: 500;">
            ${subject}
          </p>
        </td>
      </tr>
    </table>

    ${
      resolution
        ? `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
      <tr>
        <td style="background-color: #ecfdf5; border-radius: 8px; padding: 20px; border-left: 4px solid #10b981;">
          <p style="font-size: 13px; color: #059669; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.5px;">
            Resolution
          </p>
          <p style="font-size: 15px; color: #064e3b; margin: 0; line-height: 1.6;">
            ${resolution}
          </p>
        </td>
      </tr>
    </table>
    `
        : ''
    }

    <p style="font-size: 15px; color: #334155; margin: 0 0 32px 0; line-height: 1.6;">
      If you have any further questions or need additional assistance, feel free to create a new support ticket.
    </p>

    <div style="border-top: 1px solid #e2e8f0; padding-top: 24px;">
      <p style="font-size: 13px; color: #94a3b8; margin: 0; line-height: 1.6;">
        Thank you for using Strakly!
      </p>
    </div>
  `;

  return baseTemplate({
    preheader: `Your support ticket #${ticketNumber} has been resolved`,
    content,
    footerText: 'You received this email because you submitted a support ticket.',
  });
}

export function ticketResolvedPlainText(
  options: TicketResolvedTemplateOptions,
): string {
  const { userName, ticketNumber, subject, resolution } = options;

  return `
Your Support Ticket is Resolved

Hi ${userName},

Great news! Your support ticket has been resolved.

Ticket Number: ${ticketNumber}
Subject: ${subject}
${resolution ? `\nResolution:\n${resolution}` : ''}

If you have any further questions or need additional assistance, feel free to create a new support ticket.

Thank you for using Strakly!

---
Strakly
https://strakly.com
  `.trim();
}
