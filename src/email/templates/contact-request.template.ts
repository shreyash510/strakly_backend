import { baseTemplate } from './base.template';

export interface ContactRequestTemplateOptions {
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  requestNumber: string;
  submittedAt: string;
}

export function contactRequestTemplate(
  options: ContactRequestTemplateOptions,
): string {
  const { name, email, phone, subject, message, requestNumber, submittedAt } =
    options;

  const content = `
    <h1 style="font-size: 22px; font-weight: 600; color: #0f172a; margin: 0 0 8px 0; text-align: center;">
      New Contact Request
    </h1>
    <p style="font-size: 15px; color: #64748b; margin: 0 0 32px 0; text-align: center;">
      Someone has submitted a contact form on Strakly
    </p>

    <!-- Request Details Card -->
    <div style="background-color: #f8fafc; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td style="padding-bottom: 16px; border-bottom: 1px solid #e2e8f0;">
            <p style="font-size: 12px; color: #64748b; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.5px;">Request Number</p>
            <p style="font-size: 15px; color: #0f172a; margin: 0; font-weight: 600;">${requestNumber}</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 16px 0; border-bottom: 1px solid #e2e8f0;">
            <p style="font-size: 12px; color: #64748b; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.5px;">Name</p>
            <p style="font-size: 15px; color: #0f172a; margin: 0; font-weight: 500;">${name}</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 16px 0; border-bottom: 1px solid #e2e8f0;">
            <p style="font-size: 12px; color: #64748b; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.5px;">Email</p>
            <a href="mailto:${email}" style="font-size: 15px; color: #2563eb; margin: 0; text-decoration: none;">${email}</a>
          </td>
        </tr>
        ${
          phone
            ? `
        <tr>
          <td style="padding: 16px 0; border-bottom: 1px solid #e2e8f0;">
            <p style="font-size: 12px; color: #64748b; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.5px;">Phone</p>
            <a href="tel:${phone}" style="font-size: 15px; color: #2563eb; margin: 0; text-decoration: none;">${phone}</a>
          </td>
        </tr>
        `
            : ''
        }
        ${
          subject
            ? `
        <tr>
          <td style="padding: 16px 0; border-bottom: 1px solid #e2e8f0;">
            <p style="font-size: 12px; color: #64748b; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.5px;">Subject</p>
            <p style="font-size: 15px; color: #0f172a; margin: 0; font-weight: 500;">${subject}</p>
          </td>
        </tr>
        `
            : ''
        }
        <tr>
          <td style="padding-top: 16px;">
            <p style="font-size: 12px; color: #64748b; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.5px;">Submitted At</p>
            <p style="font-size: 15px; color: #0f172a; margin: 0;">${submittedAt}</p>
          </td>
        </tr>
      </table>
    </div>

    <!-- Message Section -->
    <div style="margin-bottom: 24px;">
      <p style="font-size: 12px; color: #64748b; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.5px;">Message</p>
      <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px;">
        <p style="font-size: 15px; color: #334155; margin: 0; line-height: 1.6; white-space: pre-wrap;">${message}</p>
      </div>
    </div>

    <!-- Reply Button -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="center" style="padding: 8px 0;">
          <a href="mailto:${email}?subject=Re: ${subject || 'Your inquiry'}"
             style="display: inline-block; background-color: #0f172a; color: #ffffff; padding: 12px 32px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none;">
            Reply to ${name}
          </a>
        </td>
      </tr>
    </table>
  `;

  return baseTemplate({
    preheader: `New contact request from ${name}`,
    content,
    footerText: 'This is an automated notification from Strakly contact form.',
  });
}

export function contactRequestPlainText(
  options: ContactRequestTemplateOptions,
): string {
  const { name, email, phone, subject, message, requestNumber, submittedAt } =
    options;

  return `
NEW CONTACT REQUEST
===================

Request Number: ${requestNumber}

FROM:
Name: ${name}
Email: ${email}${phone ? `\nPhone: ${phone}` : ''}${subject ? `\nSubject: ${subject}` : ''}

MESSAGE:
${message}

---
Submitted: ${submittedAt}

Reply to this inquiry by emailing: ${email}

---
Strakly
https://strakly.com
  `.trim();
}
