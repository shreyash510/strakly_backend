import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  SendEmailDto,
} from './dto/email.dto';
import {
  passwordResetOtpTemplate,
  passwordResetOtpPlainText,
  passwordResetSuccessTemplate,
  passwordResetSuccessPlainText,
  paymentReceiptTemplate,
  paymentReceiptPlainText,
  emailVerificationTemplate,
  emailVerificationPlainText,
  contactRequestTemplate,
  contactRequestPlainText,
  ticketResolvedTemplate,
  ticketResolvedPlainText,
} from './templates';

export interface EmailResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface BrevoResponse {
  messageId?: string;
  code?: string;
  message?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly defaultFromEmail: string;
  private readonly defaultFromName: string;
  private readonly brevoApiUrl: string = 'https://api.brevo.com/v3/smtp/email';
  private readonly brevoApiKey: string;

  constructor(private readonly configService: ConfigService) {
    this.brevoApiKey =
      this.configService.get<string>('BREVO_API_KEY') ||
      '';

    if (this.brevoApiKey) {
      this.logger.log('Brevo API configured');
    } else {
      this.logger.warn('Brevo API key not configured');
    }

    this.defaultFromEmail =
      this.configService.get<string>('BREVO_FROM_EMAIL') ||
      'support@strakly.com';
    this.defaultFromName =
      this.configService.get<string>('BREVO_FROM_NAME') ||
      'Strakly';
  }

  /**
   * Send a single email via Brevo transactional email API
   * Documentation: https://developers.brevo.com/reference/sendtransacemail
   */
  async sendEmail(dto: SendEmailDto): Promise<EmailResponse> {
    try {
      // Build Brevo API payload
      const emailPayload: Record<string, any> = {
        sender: {
          name: dto.fromName || this.defaultFromName,
          email: dto.from || this.defaultFromEmail,
        },
        to: [
          {
            email: dto.to,
            name: dto.to,
          },
        ],
        subject: dto.subject,
      };

      // Add HTML body
      if (dto.html) {
        emailPayload.htmlContent = dto.html;
      }

      // Add plain text body
      if (dto.text) {
        emailPayload.textContent = dto.text;
      }

      // Add CC recipients
      if (dto.cc && dto.cc.length > 0) {
        emailPayload.cc = dto.cc.map((email) => ({
          email,
          name: email,
        }));
      }

      // Add BCC recipients
      if (dto.bcc && dto.bcc.length > 0) {
        emailPayload.bcc = dto.bcc.map((email) => ({
          email,
          name: email,
        }));
      }

      this.logger.debug(
        `Sending email to ${dto.to} with subject: ${dto.subject}`,
      );
      this.logger.debug(
        `Email payload: ${JSON.stringify(emailPayload, null, 2)}`,
      );

      const response = await axios.post(this.brevoApiUrl, emailPayload, {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'api-key': this.brevoApiKey,
        },
      });

      const data: BrevoResponse = response.data;

      if (data.code) {
        const errorMessage = data.message || 'Unknown Brevo error';
        this.logger.error(`Failed to send email to ${dto.to}: ${errorMessage}`);
        return {
          success: false,
          error: errorMessage,
        };
      }

      this.logger.log(`Email sent successfully to ${dto.to}`);
      return {
        success: true,
        messageId: data.messageId,
      };
    } catch (error: unknown) {
      const axiosErr = error as Record<string, any>;
      const errorMessage =
        axiosErr.response?.data?.message ||
        axiosErr.response?.data?.code ||
        (error instanceof Error ? error.message : String(error));
      this.logger.error(`Failed to send email to ${dto.to}: ${errorMessage}`);
      this.logger.error(
        `Full API Response: ${JSON.stringify(axiosErr.response?.data)}`,
      );
      this.logger.error(`Status Code: ${axiosErr.response?.status}`);
      return {
        success: false,
        error: errorMessage,
      };
    }
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
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ||
      'https://app.strakly.com';
    const html = passwordResetSuccessTemplate({
      userName,
      loginUrl: `${frontendUrl}/login`,
    });
    const text = passwordResetSuccessPlainText({
      userName,
      loginUrl: `${frontendUrl}/login`,
    });

    return this.sendEmail({
      to,
      subject: 'Your password has been reset - Strakly',
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

  /**
   * Send contact request notification to support
   */
  async sendContactRequestNotification(
    name: string,
    email: string,
    phone: string | null,
    subject: string | null,
    message: string,
    requestNumber: string,
  ): Promise<EmailResponse> {
    const submittedAt = new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    const html = contactRequestTemplate({
      name,
      email,
      phone,
      subject,
      message,
      requestNumber,
      submittedAt,
    });
    const text = contactRequestPlainText({
      name,
      email,
      phone,
      subject,
      message,
      requestNumber,
      submittedAt,
    });

    const emailSubject = subject
      ? `New Contact Request: ${requestNumber} - ${subject}`
      : `New Contact Request: ${requestNumber}`;

    return this.sendEmail({
      to: 'support@strakly.com',
      subject: emailSubject,
      html,
      text,
    });
  }

  /**
   * Send support ticket resolved email to user
   */
  async sendTicketResolvedEmail(
    to: string,
    userName: string,
    ticketNumber: string,
    subject: string,
    resolution?: string,
  ): Promise<EmailResponse> {
    const html = ticketResolvedTemplate({
      userName,
      ticketNumber,
      subject,
      resolution,
    });
    const text = ticketResolvedPlainText({
      userName,
      ticketNumber,
      subject,
      resolution,
    });

    return this.sendEmail({
      to,
      subject: `Your Support Ticket #${ticketNumber} is Resolved - Strakly`,
      html,
      text,
    });
  }
}
