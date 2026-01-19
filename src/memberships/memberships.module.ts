import { Module } from '@nestjs/common';
import { MembershipsController } from './memberships.controller';
import { MembershipsService } from './memberships.service';
import { PlansModule } from '../plans/plans.module';
import { OffersModule } from '../offers/offers.module';

@Module({
  imports: [PlansModule, OffersModule],
  controllers: [MembershipsController],
  providers: [MembershipsService],
  exports: [MembershipsService],
})
export class MembershipsModule {}
