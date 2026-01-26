import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SendEmailDto,
  SendBulkEmailDto,
  SendTemplateEmailDto,
} from './dto/email.dto';
import {
  passwordResetOtpTemplate,
  passwordResetOtpPlainText,
  passwordResetSuccessTemplate,
  passwordResetSuccessPlainText,
  welcomeTemplate,
  welcomePlainText,
  membershipExpiryTemplate,
  membershipExpiryPlainText,
  paymentReceiptTemplate,
  paymentReceiptPlainText,
  emailVerificationTemplate,
  emailVerificationPlainText,
} from './templates';

export interface EmailResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface SendPulseTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface SendPulseEmailResponse {
  result: boolean;
  id?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly defaultFromEmail: string;
  private readonly defaultFromName: string;
  private readonly sendPulseClientId: string;
  private readonly sendPulseClientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  private readonly SENDPULSE_API_URL = 'https://api.sendpulse.com';

  constructor(private readonly configService: ConfigService) {
    this.sendPulseClientId = this.configService.get<string>('SENDPULSE_CLIENT_ID') || '';
    this.sendPulseClientSecret = this.configService.get<string>('SENDPULSE_CLIENT_SECRET') || '';

    if (this.sendPulseClientId && this.sendPulseClientSecret) {
      this.logger.log('SendPulse credentials configured');
    } else {
      this.logger.warn('SendPulse credentials not configured');
    }

    this.defaultFromEmail = this.configService.get<string>('SENDPULSE_FROM_EMAIL') || 'support@strakly.com';
    this.defaultFromName = this.configService.get<string>('SENDPULSE_FROM_NAME') || 'Strakly';
  }

  /**
   * Get SendPulse access token (with caching)
   */
  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid (with 5 min buffer)
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 300000) {
      return this.accessToken;
    }

    try {
      const response = await fetch(`${this.SENDPULSE_API_URL}/oauth/access_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: this.sendPulseClientId,
          client_secret: this.sendPulseClientSecret,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to get access token: ${response.statusText}`);
      }

      const data: SendPulseTokenResponse = await response.json();
      this.accessToken = data.access_token;
      this.tokenExpiresAt = Date.now() + data.expires_in * 1000;

      this.logger.log('SendPulse access token obtained');
      return this.accessToken;
    } catch (error: any) {
      this.logger.error(`Failed to get SendPulse access token: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send a single email via SendPulse SMTP API
   */
  async sendEmail(dto: SendEmailDto): Promise<EmailResponse> {
    try {
      const token = await this.getAccessToken();

      const emailPayload: any = {
        email: {
          subject: dto.subject,
          from: {
            name: dto.fromName || this.defaultFromName,
            email: dto.from || this.defaultFromEmail,
          },
          to: [
            {
              email: dto.to,
            },
          ],
        },
      };

      // Add HTML body
      if (dto.html) {
        emailPayload.email.html = Buffer.from(dto.html).toString('base64');
      }

      // Add text body
      if (dto.text) {
        emailPayload.email.text = dto.text;
      }

      // Add CC recipients
      if (dto.cc && dto.cc.length > 0) {
        emailPayload.email.cc = dto.cc.map(email => ({ email }));
      }

      // Add BCC recipients
      if (dto.bcc && dto.bcc.length > 0) {
        emailPayload.email.bcc = dto.bcc.map(email => ({ email }));
      }

      // Add attachments
      if (dto.attachments && dto.attachments.length > 0) {
        emailPayload.email.attachments = dto.attachments.reduce((acc: any, attachment) => {
          acc[attachment.filename] = attachment.content;
          return acc;
        }, {});
      }

      const response = await fetch(`${this.SENDPULSE_API_URL}/smtp/emails`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(emailPayload),
      });

      const responseText = await response.text();
      let data: SendPulseEmailResponse;

      try {
        data = JSON.parse(responseText);
      } catch {
        this.logger.error(`Invalid JSON response from SendPulse: ${responseText}`);
        return {
          success: false,
          error: `Invalid response from SendPulse: ${responseText}`,
        };
      }

      if (!response.ok || !data.result) {
        this.logger.error(`Failed to send email to ${dto.to}: ${responseText}`);
        return {
          success: false,
          error: responseText,
        };
      }

      this.logger.log(`Email sent successfully to ${dto.to}`);
      return {
        success: true,
        messageId: data.id,
      };
    } catch (error: any) {
      this.logger.error(`Failed to send email to ${dto.to}: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send bulk emails (multiple recipients, same content)
   */
  async sendBulkEmail(dto: SendBulkEmailDto): Promise<EmailResponse> {
    try {
      const token = await this.getAccessToken();

      const emailPayload: any = {
        email: {
          subject: dto.subject,
          from: {
            name: dto.fromName || this.defaultFromName,
            email: dto.from || this.defaultFromEmail,
          },
          to: dto.to.map(email => ({ email })),
        },
      };

      if (dto.html) {
        emailPayload.email.html = Buffer.from(dto.html).toString('base64');
      }

      if (dto.text) {
        emailPayload.email.text = dto.text;
      }

      const response = await fetch(`${this.SENDPULSE_API_URL}/smtp/emails`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(emailPayload),
      });

      const responseText = await response.text();
      let data: SendPulseEmailResponse;

      try {
        data = JSON.parse(responseText);
      } catch {
        return {
          success: false,
          error: `Invalid response from SendPulse: ${responseText}`,
        };
      }

      if (!response.ok || !data.result) {
        this.logger.error(`Failed to send bulk email: ${responseText}`);
        return {
          success: false,
          error: responseText,
        };
      }

      this.logger.log(`Bulk email sent successfully to ${dto.to.length} recipients`);
      return {
        success: true,
        messageId: data.id,
      };
    } catch (error: any) {
      this.logger.error(`Failed to send bulk email: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send email using template (SendPulse doesn't have dynamic templates like SendGrid,
   * so we'll just send regular HTML email)
   */
  async sendTemplateEmail(dto: SendTemplateEmailDto): Promise<EmailResponse> {
    this.logger.warn('SendPulse does not support dynamic templates. Use sendEmail with HTML instead.');
    return {
      success: false,
      error: 'Template emails not supported with SendPulse. Use sendEmail with HTML.',
    };
  }

  /**
   * Send password reset OTP email
   */
  async sendPasswordResetOtpEmail(
    to: string,
    userName: string,
    otp: string,
    expiryMinutes: number = 10,
  ): Promise<EmailResponse> {
    const html = passwordResetOtpTemplate({ userName, otp, expiryMinutes });
    const text = passwordResetOtpPlainText({ userName, otp, expiryMinutes });

    return this.sendEmail({
      to,
      subject: `${otp} is your Strakly verification code`,
      html,
      text,
    });
  }

  /**
   * Send email verification OTP
   */
  async sendEmailVerificationEmail(
    to: string,
    userName: string,
    otp: string,
    expiryMinutes: number = 10,
  ): Promise<EmailResponse> {
    const html = emailVerificationTemplate({ userName, otp, expiryMinutes });
    const text = emailVerificationPlainText({ userName, otp, expiryMinutes });

    return this.sendEmail({
      to,
      subject: `${otp} is your Strakly verification code`,
      html,
      text,
    });
  }

  /**
   * Send password reset success email
   */
  async sendPasswordResetSuccessEmail(
    to: string,
    userName: string,
  ): Promise<EmailResponse> {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'https://app.strakly.com';
    const html = passwordResetSuccessTemplate({ userName, loginUrl: `${frontendUrl}/login` });
    const text = passwordResetSuccessPlainText({ userName, loginUrl: `${frontendUrl}/login` });

    return this.sendEmail({
      to,
      subject: 'Your password has been reset - Strakly',
      html,
      text,
    });
  }

  /**
   * Send welcome email to new client
   */
  async sendWelcomeEmail(
    to: string,
    clientName: string,
    gymName: string,
  ): Promise<EmailResponse> {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'https://app.strakly.com';
    const html = welcomeTemplate({ userName: clientName, gymName, loginUrl: `${frontendUrl}/login` });
    const text = welcomePlainText({ userName: clientName, gymName, loginUrl: `${frontendUrl}/login` });

    return this.sendEmail({
      to,
      subject: `Welcome to ${gymName}!`,
      html,
      text,
    });
  }

  /**
   * Send membership expiry reminder
   */
  async sendMembershipExpiryReminder(
    to: string,
    clientName: string,
    gymName: string,
    expiryDate: Date,
    daysRemaining: number,
  ): Promise<EmailResponse> {
    const formattedDate = expiryDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const html = membershipExpiryTemplate({
      userName: clientName,
      gymName,
      expiryDate: formattedDate,
      daysRemaining,
    });
    const text = membershipExpiryPlainText({
      userName: clientName,
      gymName,
      expiryDate: formattedDate,
      daysRemaining,
    });

    return this.sendEmail({
      to,
      subject: `Membership Expiry Reminder - ${gymName}`,
      html,
      text,
    });
  }

  /**
   * Send invoice/payment receipt email
   */
  async sendPaymentReceiptEmail(
    to: string,
    clientName: string,
    gymName: string,
    amount: number,
    currency: string,
    planName: string,
    paymentDate: Date,
    invoiceNumber?: string,
    validUntil?: Date,
  ): Promise<EmailResponse> {
    const formattedDate = paymentDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const formattedValidUntil = validUntil
      ? validUntil.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : undefined;

    const html = paymentReceiptTemplate({
      userName: clientName,
      gymName,
      amount: amount.toFixed(2),
      currency,
      planName,
      paymentDate: formattedDate,
      invoiceNumber,
      validUntil: formattedValidUntil,
    });
    const text = paymentReceiptPlainText({
      userName: clientName,
      gymName,
      amount: amount.toFixed(2),
      currency,
      planName,
      paymentDate: formattedDate,
      invoiceNumber,
      validUntil: formattedValidUntil,
    });

    return this.sendEmail({
      to,
      subject: `Payment Receipt - ${gymName}`,
      html,
      text,
    });
  }
}
