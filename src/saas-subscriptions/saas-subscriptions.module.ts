import { Module } from '@nestjs/common';
import { SaasSubscriptionsController } from './saas-subscriptions.controller';
import { SaasSubscriptionsService } from './saas-subscriptions.service';

@Module({
  controllers: [SaasSubscriptionsController],
  providers: [SaasSubscriptionsService],
  exports: [SaasSubscriptionsService],
})
export class SaasSubscriptionsModule {}
