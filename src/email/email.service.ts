import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
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

interface ZeptoMailResponse {
  data?: {
    request_id?: string;
    message?: string;
  }[];
  error?: {
    code: string;
    details: { code: string; message: string; target: string }[];
    message: string;
  };
  message?: string;
  request_id?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly defaultFromEmail: string;
  private readonly defaultFromName: string;
  private readonly zeptoMailApiUrl: string;
  private readonly zeptoMailApiKey: string;

  constructor(private readonly configService: ConfigService) {
    this.zeptoMailApiUrl = this.configService.get<string>('ZEPTOMAIL_API_URL') || 'https://api.zeptomail.in/v1.1/email';
    this.zeptoMailApiKey = this.configService.get<string>('ZEPTOMAIL_API_KEY') || '';

    if (this.zeptoMailApiKey) {
      this.logger.log('ZeptoMail API configured');
    } else {
      this.logger.warn('ZeptoMail API key not configured');
    }

    this.defaultFromEmail = this.configService.get<string>('ZEPTOMAIL_FROM_EMAIL') || 'support@strakly.com';
    this.defaultFromName = this.configService.get<string>('ZEPTOMAIL_FROM_NAME') || 'Strakly';
  }

  /**
   * Send a single email via ZeptoMail Native API
   */
  async sendEmail(dto: SendEmailDto): Promise<EmailResponse> {
    try {
      // Build native ZeptoMail API payload
      const emailPayload: any = {
        from: {
          address: dto.from || this.defaultFromEmail,
          name: dto.fromName || this.defaultFromName,
        },
        to: [
          {
            email_address: {
              address: dto.to,
              name: dto.to,
            },
          },
        ],
        subject: dto.subject,
      };

      // Add HTML content
      if (dto.html) {
        emailPayload.htmlbody = dto.html;
      }

      // Add plain text content
      if (dto.text) {
        emailPayload.textbody = dto.text;
      }

      // Add CC recipients
      if (dto.cc && dto.cc.length > 0) {
        emailPayload.cc = dto.cc.map(email => ({
          email_address: {
            address: email,
            name: email,
          },
        }));
      }

      // Add BCC recipients
      if (dto.bcc && dto.bcc.length > 0) {
        emailPayload.bcc = dto.bcc.map(email => ({
          email_address: {
            address: email,
            name: email,
          },
        }));
      }

      this.logger.debug(`Sending email to ${dto.to} with subject: ${dto.subject}`);

      const response = await axios.post(this.zeptoMailApiUrl, emailPayload, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': this.zeptoMailApiKey,
        },
      });

      const data: ZeptoMailResponse = response.data;

      if (data.error) {
        const errorMessage = data.error?.message || data.message;
        this.logger.error(`Failed to send email to ${dto.to}: ${errorMessage}`);
        return {
          success: false,
          error: errorMessage,
        };
      }

      this.logger.log(`Email sent successfully to ${dto.to}`);
      return {
        success: true,
        messageId: data.request_id || data.data?.[0]?.request_id,
      };
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.response?.data?.error?.message || error.message;
      this.logger.error(`Failed to send email to ${dto.to}: ${errorMessage}`);
      if (error.response?.data) {
        this.logger.error(`API Response: ${JSON.stringify(error.response.data)}`);
      }
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Send bulk emails (multiple recipients, same content)
   */
  async sendBulkEmail(dto: SendBulkEmailDto): Promise<EmailResponse> {
    try {
      // Build native ZeptoMail API payload
      const emailPayload: any = {
        from: {
          address: dto.from || this.defaultFromEmail,
          name: dto.fromName || this.defaultFromName,
        },
        to: dto.to.map(email => ({
          email_address: {
            address: email,
            name: email,
          },
        })),
        subject: dto.subject,
      };

      if (dto.html) {
        emailPayload.htmlbody = dto.html;
      }

      if (dto.text) {
        emailPayload.textbody = dto.text;
      }

      const response = await axios.post(this.zeptoMailApiUrl, emailPayload, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': this.zeptoMailApiKey,
        },
      });

      const data: ZeptoMailResponse = response.data;

      if (data.error) {
        const errorMessage = data.error?.message || data.message;
        this.logger.error(`Failed to send bulk email: ${errorMessage}`);
        return {
          success: false,
          error: errorMessage,
        };
      }

      this.logger.log(`Bulk email sent successfully to ${dto.to.length} recipients`);
      return {
        success: true,
        messageId: data.request_id || data.data?.[0]?.request_id,
      };
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.response?.data?.error?.message || error.message;
      this.logger.error(`Failed to send bulk email: ${errorMessage}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send email using template
   */
  async sendTemplateEmail(dto: SendTemplateEmailDto): Promise<EmailResponse> {
    this.logger.warn('ZeptoMail template emails require template setup in ZeptoMail dashboard.');
    return {
      success: false,
      error: 'Template emails require ZeptoMail template setup. Use sendEmail with HTML instead.',
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
