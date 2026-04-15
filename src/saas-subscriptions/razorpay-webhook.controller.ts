import { Controller, Post, Req, HttpCode, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SaasSubscriptionsService } from './saas-subscriptions.service';

@ApiTags('webhooks')
@Controller('webhooks/razorpay')
export class RazorpayWebhookController {
  private readonly logger = new Logger(RazorpayWebhookController.name);

  constructor(private readonly service: SaasSubscriptionsService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Razorpay webhook endpoint (unauthenticated)' })
  async handleWebhook(@Req() req: any) {
    const signature = req.headers['x-razorpay-signature'] as string;
    if (!signature) {
      this.logger.warn('Webhook received without signature header');
      return { status: 'missing_signature' };
    }

    // Use raw body for signature verification
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);

    try {
      return await this.service.handleRazorpayWebhook(rawBody, signature);
    } catch (error) {
      this.logger.error('Webhook processing failed', error);
      return { status: 'error', message: error.message };
    }
  }
}
