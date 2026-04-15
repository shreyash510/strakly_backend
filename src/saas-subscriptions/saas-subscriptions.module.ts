import { Module } from '@nestjs/common';
import { SaasSubscriptionsController } from './saas-subscriptions.controller';
import { SaasSubscriptionsService } from './saas-subscriptions.service';
import { RazorpayModule } from '../razorpay/razorpay.module';
import { RazorpayWebhookController } from './razorpay-webhook.controller';

@Module({
  imports: [RazorpayModule],
  controllers: [SaasSubscriptionsController, RazorpayWebhookController],
  providers: [SaasSubscriptionsService],
  exports: [SaasSubscriptionsService],
})
export class SaasSubscriptionsModule {}
