import { Module } from '@nestjs/common';
import { GuestVisitsService } from './guest-visits.service';
import { GuestVisitsController } from './guest-visits.controller';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [TenantModule],
  controllers: [GuestVisitsController],
  providers: [GuestVisitsService],
  exports: [GuestVisitsService],
})
export class GuestVisitsModule {}
