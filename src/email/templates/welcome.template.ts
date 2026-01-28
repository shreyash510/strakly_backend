import { baseTemplate } from './base.template';

export interface WelcomeTemplateOptions {
  userName: string;
  gymName: string;
  loginUrl?: string;
}

export function welcomeTemplate(options: WelcomeTemplateOptions): string {
  const { userName, gymName, loginUrl = 'https://app.strakly.com/login' } = options;

  const content = `
    <h1 style="font-size: 22px; font-weight: 600; color: #0f172a; margin: 0 0 8px 0; text-align: center;">
      Welcome to ${gymName}
    </h1>
    <p style="font-size: 15px; color: #64748b; margin: 0 0 32px 0; text-align: center;">
      Your account is ready
    </p>

    <p style="font-size: 15px; color: #334155; margin: 0 0 24px 0; line-height: 1.6;">
      Hi ${userName},
    </p>

    <p style="font-size: 15px; color: #334155; margin: 0 0 24px 0; line-height: 1.6;">
      Welcome to <strong>${gymName}</strong>! Your account has been created successfully. You're all set to start your fitness journey.
    </p>

    <!-- Features -->
    <div style="background-color: #f8fafc; border-radius: 8px; padding: 20px 24px; margin-bottom: 32px;">
      <p style="font-size: 14px; font-weight: 600; color: #334155; margin: 0 0 12px 0;">
        With your account, you can:
      </p>
      <ul style="margin: 0; padding: 0 0 0 20px; color: #64748b; font-size: 14px; line-height: 1.8;">
        <li>Track your fitness goals and progress</li>
        <li>Log your workouts and build habits</li>
        <li>Check-in with your attendance code</li>
        <li>Monitor your body metrics over time</li>
      </ul>
    </div>

    <!-- CTA Button -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="center" style="padding: 0 0 32px 0;">
          <a href="${loginUrl}" style="display: inline-block; padding: 14px 28px; font-size: 15px; font-weight: 600; color: #ffffff; background-color: #4f46e5; border-radius: 8px; text-decoration: none;">
            Get started
          </a>
        </td>
      </tr>
    </table>

    <p style="font-size: 13px; color: #94a3b8; margin: 0; text-align: center; line-height: 1.6;">
      Questions? Contact your gym or reach out at <a href="mailto:support@strakly.com" style="color: #4f46e5;">support@strakly.com</a>
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
Welcome to ${gymName}

Hi ${userName},

Welcome to ${gymName}! Your account has been created successfully. You're all set to start your fitness journey.

With your account, you can:
- Track your fitness goals and progress
- Log your workouts and build habits
- Check-in with your attendance code
- Monitor your body metrics over time

Get started: ${loginUrl}

Questions? Contact your gym or reach out at support@strakly.com

---
Strakly
https://strakly.com
  `.trim();
}
