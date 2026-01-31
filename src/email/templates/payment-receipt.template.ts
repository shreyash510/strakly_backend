import { baseTemplate } from './base.template';

export interface PaymentReceiptTemplateOptions {
  userName: string;
  gymName: string;
  amount: string;
  currency: string;
  planName: string;
  paymentDate: string;
  invoiceNumber?: string;
  paymentMethod?: string;
  validUntil?: string;
}

export function paymentReceiptTemplate(
  options: PaymentReceiptTemplateOptions,
): string {
  const {
    userName,
    gymName,
    amount,
    currency,
    planName,
    paymentDate,
    invoiceNumber,
    paymentMethod,
    validUntil,
  } = options;

  const content = `
    <h1 style="font-size: 22px; font-weight: 600; color: #0f172a; margin: 0 0 8px 0; text-align: center;">
      Payment received
    </h1>
    <p style="font-size: 15px; color: #64748b; margin: 0 0 32px 0; text-align: center;">
      Thank you for your payment
    </p>

    <p style="font-size: 15px; color: #334155; margin: 0 0 24px 0; line-height: 1.6;">
      Hi ${userName},
    </p>

    <p style="font-size: 15px; color: #334155; margin: 0 0 24px 0; line-height: 1.6;">
      Your payment has been processed successfully. Here are the details:
    </p>

    <!-- Receipt Card -->
    <div style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 32px;">
      <!-- Amount Header -->
      <div style="background-color: #f8fafc; padding: 20px 24px; border-bottom: 1px solid #e2e8f0;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td>
              <p style="font-size: 12px; color: #64748b; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.5px;">Amount paid</p>
              <p style="font-size: 24px; font-weight: 700; color: #059669; margin: 0;">${currency} ${amount}</p>
            </td>
            ${
              invoiceNumber
                ? `
            <td align="right">
              <p style="font-size: 12px; color: #64748b; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.5px;">Invoice</p>
              <p style="font-size: 14px; font-weight: 600; color: #334155; margin: 0;">#${invoiceNumber}</p>
            </td>
            `
                : ''
            }
          </tr>
        </table>
      </div>

      <!-- Details -->
      <div style="padding: 20px 24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">
              <span style="font-size: 14px; color: #64748b;">Gym</span>
            </td>
            <td align="right" style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">
              <span style="font-size: 14px; font-weight: 500; color: #334155;">${gymName}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">
              <span style="font-size: 14px; color: #64748b;">Plan</span>
            </td>
            <td align="right" style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">
              <span style="font-size: 14px; font-weight: 500; color: #334155;">${planName}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; ${validUntil || paymentMethod ? 'border-bottom: 1px solid #f1f5f9;' : ''}">
              <span style="font-size: 14px; color: #64748b;">Date</span>
            </td>
            <td align="right" style="padding: 8px 0; ${validUntil || paymentMethod ? 'border-bottom: 1px solid #f1f5f9;' : ''}">
              <span style="font-size: 14px; font-weight: 500; color: #334155;">${paymentDate}</span>
            </td>
          </tr>
          ${
            paymentMethod
              ? `
          <tr>
            <td style="padding: 8px 0; ${validUntil ? 'border-bottom: 1px solid #f1f5f9;' : ''}">
              <span style="font-size: 14px; color: #64748b;">Payment method</span>
            </td>
            <td align="right" style="padding: 8px 0; ${validUntil ? 'border-bottom: 1px solid #f1f5f9;' : ''}">
              <span style="font-size: 14px; font-weight: 500; color: #334155;">${paymentMethod}</span>
            </td>
          </tr>
          `
              : ''
          }
          ${
            validUntil
              ? `
          <tr>
            <td style="padding: 8px 0;">
              <span style="font-size: 14px; color: #64748b;">Valid until</span>
            </td>
            <td align="right" style="padding: 8px 0;">
              <span style="font-size: 14px; font-weight: 500; color: #059669;">${validUntil}</span>
            </td>
          </tr>
          `
              : ''
          }
        </table>
      </div>
    </div>

    <p style="font-size: 13px; color: #94a3b8; margin: 0; text-align: center; line-height: 1.6;">
      Questions? Contact <a href="mailto:support@strakly.com" style="color: #4f46e5;">support@strakly.com</a>
    </p>
  `;

  return baseTemplate({
    preheader: `Payment of ${currency} ${amount} received for ${planName}`,
    content,
    footerText:
      'This is your payment receipt. Please keep it for your records.',
  });
}

export function paymentReceiptPlainText(
  options: PaymentReceiptTemplateOptions,
): string {
  const {
    userName,
    gymName,
    amount,
    currency,
    planName,
    paymentDate,
    invoiceNumber,
    validUntil,
  } = options;

  return `
Payment received

Hi ${userName},

Your payment has been processed successfully. Here are the details:

Amount paid: ${currency} ${amount}
${invoiceNumber ? `Invoice: #${invoiceNumber}` : ''}
Gym: ${gymName}
Plan: ${planName}
Date: ${paymentDate}
${validUntil ? `Valid until: ${validUntil}` : ''}

Questions? Contact support@strakly.com

---
Strakly
https://strakly.com
  `.trim();
}
