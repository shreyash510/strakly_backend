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

export function paymentReceiptTemplate(options: PaymentReceiptTemplateOptions): string {
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
    <!-- Icon -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="center" style="padding-bottom: 24px;">
          <div style="width: 72px; height: 72px; background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); border-radius: 50%; display: inline-block; line-height: 72px; text-align: center;">
            <span style="font-size: 36px;">&#10003;</span>
          </div>
        </td>
      </tr>
    </table>

    <!-- Heading -->
    <h1 style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 24px; font-weight: 700; color: #1f2937; margin: 0 0 8px 0; text-align: center;">
      Payment Successful
    </h1>

    <!-- Subheading -->
    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; color: #6b7280; margin: 0 0 32px 0; text-align: center;">
      Thank you for your payment
    </p>

    <!-- Greeting -->
    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; color: #374151; margin: 0 0 20px 0; line-height: 1.6;">
      Hi <strong>${userName}</strong>,
    </p>

    <!-- Message -->
    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; color: #374151; margin: 0 0 24px 0; line-height: 1.6;">
      Your payment has been processed successfully. Here are the details:
    </p>

    <!-- Receipt Card -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 32px; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
      <!-- Header -->
      <tr>
        <td style="padding: 20px 24px; background-color: #f9fafb; border-bottom: 1px solid #e5e7eb;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td>
                <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; color: #6b7280; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.5px;">
                  Amount Paid
                </p>
                <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 28px; font-weight: 700; color: #059669; margin: 0;">
                  ${currency} ${amount}
                </p>
              </td>
              ${invoiceNumber ? `
              <td align="right">
                <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; color: #6b7280; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.5px;">
                  Invoice #
                </p>
                <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; font-weight: 600; color: #374151; margin: 0;">
                  ${invoiceNumber}
                </p>
              </td>
              ` : ''}
            </tr>
          </table>
        </td>
      </tr>

      <!-- Details -->
      <tr>
        <td style="padding: 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
                <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #6b7280;">Gym</span>
              </td>
              <td align="right" style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
                <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; font-weight: 600; color: #374151;">${gymName}</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
                <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #6b7280;">Plan</span>
              </td>
              <td align="right" style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
                <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; font-weight: 600; color: #374151;">${planName}</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
                <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #6b7280;">Date</span>
              </td>
              <td align="right" style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
                <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; font-weight: 600; color: #374151;">${paymentDate}</span>
              </td>
            </tr>
            ${paymentMethod ? `
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
                <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #6b7280;">Payment Method</span>
              </td>
              <td align="right" style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
                <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; font-weight: 600; color: #374151;">${paymentMethod}</span>
              </td>
            </tr>
            ` : ''}
            ${validUntil ? `
            <tr>
              <td style="padding: 8px 0;">
                <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #6b7280;">Valid Until</span>
              </td>
              <td align="right" style="padding: 8px 0;">
                <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; font-weight: 600; color: #059669;">${validUntil}</span>
              </td>
            </tr>
            ` : ''}
          </table>
        </td>
      </tr>
    </table>

    <!-- Support -->
    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #6b7280; margin: 0; line-height: 1.6; text-align: center;">
      Questions about this payment? Contact
      <a href="mailto:support@strakly.com" style="color: #6366f1; text-decoration: none;">support@strakly.com</a>
    </p>
  `;

  return baseTemplate({
    preheader: `Payment of ${currency} ${amount} received for ${planName} at ${gymName}.`,
    content,
    footerText: 'This is your payment receipt. Please keep it for your records.',
  });
}

export function paymentReceiptPlainText(options: PaymentReceiptTemplateOptions): string {
  const { userName, gymName, amount, currency, planName, paymentDate, invoiceNumber, validUntil } = options;

  return `
Payment Successful

Hi ${userName},

Your payment has been processed successfully. Here are the details:

Amount Paid: ${currency} ${amount}
${invoiceNumber ? `Invoice #: ${invoiceNumber}` : ''}
Gym: ${gymName}
Plan: ${planName}
Date: ${paymentDate}
${validUntil ? `Valid Until: ${validUntil}` : ''}

Questions about this payment? Contact support@strakly.com

---
Strakly
https://strakly.com
  `.trim();
}
