import { Module } from '@nestjs/common';
import { ReferralsService } from './referrals.service';
import { ReferralsController } from './referrals.controller';
import { TenantModule } from '../tenant/tenant.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';

@Module({
  imports: [TenantModule, LoyaltyModule],
  controllers: [ReferralsController],
  providers: [ReferralsService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
