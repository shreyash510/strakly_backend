import { baseTemplate } from './base.template';

export interface WelcomeTemplateOptions {
  userName: string;
  gymName: string;
  loginUrl?: string;
}

export function welcomeTemplate(options: WelcomeTemplateOptions): string {
  const { userName, gymName, loginUrl = 'https://app.strakly.com/login' } = options;

  const content = `
    <!-- Icon -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="center" style="padding-bottom: 24px;">
          <div style="width: 72px; height: 72px; background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); border-radius: 50%; display: inline-block; line-height: 72px; text-align: center;">
            <span style="font-size: 36px;">&#127881;</span>
          </div>
        </td>
      </tr>
    </table>

    <!-- Heading -->
    <h1 style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 24px; font-weight: 700; color: #1f2937; margin: 0 0 8px 0; text-align: center;">
      Welcome to ${gymName}!
    </h1>

    <!-- Subheading -->
    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; color: #6b7280; margin: 0 0 32px 0; text-align: center;">
      Your fitness journey starts here
    </p>

    <!-- Greeting -->
    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; color: #374151; margin: 0 0 20px 0; line-height: 1.6;">
      Hi <strong>${userName}</strong>,
    </p>

    <!-- Message -->
    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; color: #374151; margin: 0 0 24px 0; line-height: 1.6;">
      We're thrilled to have you join <strong>${gymName}</strong>! Your account has been created successfully and you're all set to start your fitness journey.
    </p>

    <!-- Features List -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 32px;">
      <tr>
        <td style="padding: 16px 20px; background-color: #f9fafb; border-radius: 8px;">
          <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; font-weight: 600; color: #374151; margin: 0 0 12px 0;">
            With your account, you can:
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding: 4px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #6b7280;">
                &#10003; Track your fitness goals and progress
              </td>
            </tr>
            <tr>
              <td style="padding: 4px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #6b7280;">
                &#10003; Log your daily workouts and habits
              </td>
            </tr>
            <tr>
              <td style="padding: 4px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #6b7280;">
                &#10003; Check-in easily with your attendance code
              </td>
            </tr>
            <tr>
              <td style="padding: 4px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #6b7280;">
                &#10003; Monitor your body metrics over time
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- CTA Button -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="center" style="padding-bottom: 32px;">
          <a href="${loginUrl}" class="button" style="display: inline-block; padding: 16px 36px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; font-weight: 600; color: #ffffff; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 8px; text-decoration: none;">
            Get Started
          </a>
        </td>
      </tr>
    </table>

    <!-- Support -->
    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #6b7280; margin: 0; line-height: 1.6; text-align: center;">
      Have questions? Contact your gym or reach out to us at
      <a href="mailto:support@strakly.com" style="color: #6366f1; text-decoration: none;">support@strakly.com</a>
    </p>
  `;

  return baseTemplate({
    preheader: `Welcome to ${gymName}! Your account is ready.`,
    content,
    footerText: `You received this email because you joined ${gymName}.`,
  });
}

export function welcomePlainText(options: WelcomeTemplateOptions): string {
  const { userName, gymName, loginUrl = 'https://app.strakly.com/login' } = options;

  return `
Welcome to ${gymName}!

Hi ${userName},

We're thrilled to have you join ${gymName}! Your account has been created successfully.

With your account, you can:
- Track your fitness goals and progress
- Log your daily workouts and habits
- Check-in easily with your attendance code
- Monitor your body metrics over time

Get started: ${loginUrl}

Have questions? Contact your gym or reach out to us at support@strakly.com

---
Strakly
https://strakly.com
  `.trim();
}
