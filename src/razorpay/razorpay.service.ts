import { Injectable } from '@nestjs/common';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';

@Injectable()
export class RazorpayService {
  private razorpay: Razorpay;
  private keySecret: string;
  private webhookSecret: string;

  constructor() {
    this.keySecret = process.env.RAZORPAY_KEY_SECRET || '';
    this.webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
    this.razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID || '',
      key_secret: this.keySecret,
    });
  }

  async createOrder(amount: number, currency: string, receipt: string, notes?: Record<string, string>) {
    return this.razorpay.orders.create({ amount, currency, receipt, notes });
  }

  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
    const body = orderId + '|' + paymentId;
    const expectedSignature = crypto.createHmac('sha256', this.keySecret).update(body).digest('hex');
    return expectedSignature === signature;
  }

  verifyWebhookSignature(body: string, signature: string): boolean {
    const expectedSignature = crypto.createHmac('sha256', this.webhookSecret).update(body).digest('hex');
    return expectedSignature === signature;
  }
}
