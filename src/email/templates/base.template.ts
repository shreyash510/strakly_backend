/**
 * Base email template with consistent styling
 */

export interface BaseTemplateOptions {
  preheader?: string;
  content: string;
  footerText?: string;
}

export function baseTemplate(options: BaseTemplateOptions): string {
  const {
    preheader = '',
    content,
    footerText = 'This is an automated message from Strakly.',
  } = options;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Strakly</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body, table, td, p, a, li, blockquote {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table, td {
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      -ms-interpolation-mode: bicubic;
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
    }
    body {
      height: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      background-color: #f8fafc;
    }
    a {
      color: #4f46e5;
      text-decoration: none;
    }
    @media only screen and (max-width: 600px) {
      .email-container {
        width: 100% !important;
        max-width: 100% !important;
      }
      .padding-mobile {
        padding-left: 24px !important;
        padding-right: 24px !important;
      }
      .otp-code {
        font-size: 28px !important;
        letter-spacing: 4px !important;
        padding: 16px 20px !important;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <div style="display: none; font-size: 1px; color: #f8fafc; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
    ${preheader}
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc;">
    <tr>
      <td align="center" style="padding: 48px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="560" class="email-container" style="max-width: 560px; width: 100%;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom: 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color: #4f46e5; width: 36px; height: 36px; border-radius: 8px; text-align: center; vertical-align: middle;">
                    <span style="color: #ffffff; font-size: 18px; font-weight: 700; line-height: 36px;">S</span>
                  </td>
                  <td style="padding-left: 10px; vertical-align: middle;">
                    <span style="font-size: 20px; font-weight: 600; color: #0f172a;">Strakly</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
                <tr>
                  <td class="padding-mobile" style="padding: 40px 48px;">
                    ${content}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding: 32px 16px 16px;">
              <p style="font-size: 13px; color: #64748b; margin: 0 0 8px 0; line-height: 1.5;">
                ${footerText}
              </p>
              <p style="font-size: 13px; color: #94a3b8; margin: 0;">
                &copy; ${new Date().getFullYear()} Strakly. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
