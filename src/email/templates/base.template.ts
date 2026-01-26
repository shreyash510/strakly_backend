/**
 * Base email template with consistent styling
 */

export interface BaseTemplateOptions {
  preheader?: string;
  content: string;
  footerText?: string;
}

export function baseTemplate(options: BaseTemplateOptions): string {
  const { preheader = '', content, footerText = 'This is an automated message from Strakly.' } = options;

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
    /* Reset styles */
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
      background-color: #f4f4f7;
    }
    a {
      color: #6366f1;
    }
    .button {
      display: inline-block;
      padding: 16px 36px;
      font-size: 16px;
      font-weight: 600;
      color: #ffffff !important;
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      border-radius: 8px;
      text-decoration: none;
      text-align: center;
      transition: all 0.2s ease;
    }
    .otp-code {
      font-family: 'SF Mono', Monaco, 'Courier New', monospace;
      font-size: 36px;
      font-weight: 700;
      letter-spacing: 8px;
      color: #1f2937;
      background-color: #f3f4f6;
      padding: 20px 32px;
      border-radius: 12px;
      border: 2px dashed #d1d5db;
      display: inline-block;
    }
    @media only screen and (max-width: 600px) {
      .email-container {
        width: 100% !important;
        max-width: 100% !important;
      }
      .padding-mobile {
        padding-left: 20px !important;
        padding-right: 20px !important;
      }
      .otp-code {
        font-size: 28px;
        letter-spacing: 6px;
        padding: 16px 24px;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f7;">
  <!-- Preheader text (hidden) -->
  <div style="display: none; font-size: 1px; color: #f4f4f7; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
    ${preheader}
  </div>

  <!-- Email wrapper -->
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f4f7;">
    <tr>
      <td align="center" style="padding: 40px 20px;">

        <!-- Email container -->
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" class="email-container" style="max-width: 600px; width: 100%;">

          <!-- Logo Header -->
          <tr>
            <td align="center" style="padding-bottom: 30px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align: middle; padding-right: 12px;">
                    <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 10px; display: flex; align-items: center; justify-content: center;">
                      <span style="color: white; font-size: 20px; font-weight: bold; line-height: 40px; display: block; text-align: center; width: 40px;">S</span>
                    </div>
                  </td>
                  <td style="vertical-align: middle;">
                    <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 24px; font-weight: 700; color: #1f2937;">Strakly</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main content card -->
          <tr>
            <td>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
                <tr>
                  <td class="padding-mobile" style="padding: 48px 48px 40px 48px;">
                    ${content}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding: 30px 20px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; color: #9ca3af; line-height: 1.6;">
                    <p style="margin: 0 0 8px 0;">${footerText}</p>
                    <p style="margin: 0 0 8px 0;">
                      <a href="https://strakly.com" style="color: #6b7280; text-decoration: none;">strakly.com</a>
                    </p>
                    <p style="margin: 0; color: #d1d5db;">
                      &copy; ${new Date().getFullYear()} Strakly. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
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
